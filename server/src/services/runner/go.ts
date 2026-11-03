/**
 * Go backend — the go-checkpoints reference runner: one ephemeral container per
 * job from the Go runner image (docker/runner-go), student files mounted at
 * /run/student, verdict from the entrypoint's exit code. Format (gofumpt) runs
 * in the same image through the same queue.
 */

import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { runOnCloudRun } from './cloudrun.js';
import { probeNoNewPrivileges, requireImage, runEphemeral } from './ephemeral.js';
import type { runnerSettings as Settings } from './settings.js';
import type { Backend, BackendResult, Job, JobContext, JobKind, Outcome, RunnerLog } from './types.js';

/** The Go entrypoint's exit codes (docker/runner-go/entrypoint.sh). */
const BY_EXIT: Record<number, Outcome> = {
  0: 'passed',
  1: 'failed',
  10: 'unformatted',
  11: 'forbidden',
  12: 'build_error',
  13: 'missing_file',
};

/** Format output is captured, not streamed; this bounds it. */
const FORMAT_MAX_BYTES = 4 << 20;

export class GoBackend implements Backend {
  readonly language = 'go' as const;
  private noNewPrivileges = false;

  constructor(
    private readonly settings: typeof Settings,
    private readonly log: RunnerLog,
  ) {}

  async preflight(): Promise<void> {
    if (this.settings.transport === 'cloudrun') {
      if (!this.settings.go.cloudRunUrl) throw new Error('RUNNER_BACKEND=cloudrun needs RUNNER_GO_CLOUDRUN_URL');
      return;
    }
    await requireImage(this.settings.go.image);
    this.noNewPrivileges = await probeNoNewPrivileges(this.settings.go.image);
    this.log.info('runner.go.ready', { image: this.settings.go.image, noNewPrivileges: this.noNewPrivileges });
  }

  outcomeFor(kind: JobKind, exitCode: number): Outcome {
    // Run mode has no gates, so 10-13 mean nothing there.
    if (kind === 'run') return exitCode === 0 ? 'passed' : 'failed';
    return BY_EXIT[exitCode] ?? 'error';
  }

  run(job: Job, ctx: JobContext): Promise<BackendResult> {
    if (job.kind === 'format') return this.format(job, ctx);
    const ex = job.exercise;
    const expectedFile = ex.expectedFiles?.[0] ?? '';
    const editorFiles = ex.editorFiles ?? [];
    const allowed = ex.allowedFunctions ?? [];

    if (this.settings.transport === 'cloudrun') {
      return runOnCloudRun(
        this.settings.go.cloudRunUrl,
        {
          exercise: job.slug,
          mode: job.kind === 'test' ? 'submit' : 'run',
          files: job.files,
          args: job.args,
          allowedFunctions: allowed,
          expectedFile,
          editorFiles,
        },
        ctx,
        this.log,
      );
    }

    const env = [`EXERCISE=${job.slug}`, `FILE=${expectedFile}`, `ALLOWED_FUNCTIONS=${allowed.join(' ')}`];
    if (job.kind === 'run') env.push('CODE_EDITOR_RUN_ONLY=true', `EDITOR_FILES=${editorFiles.join(',')}`);

    return runEphemeral(
      {
        image: this.settings.go.image,
        env,
        cmd: job.kind === 'run' ? job.args : [],
        runDir: join(this.settings.runsDir, job.id),
        mountAt: '/run/student',
        files: job.files,
        memoryMb: this.settings.memoryMb,
        cpus: this.settings.cpus,
        // exec: `go run` compiles into $TMPDIR and executes from there.
        tmpfs: `rw,exec,size=${this.settings.tmpfsMb}m,mode=1777`,
        pidsLimit: 256,
        readonlyRootfs: false,
        noNewPrivileges: this.noNewPrivileges,
      },
      ctx,
    );
  }

  /**
   * gofumpt over each .go file, in the runner image (same binary as the gate).
   * Non-Go files pass through untouched. No student code is executed.
   */
  private async format(job: Job, ctx: JobContext): Promise<BackendResult> {
    const goFiles = Object.keys(job.files).filter((n) => n.endsWith('.go'));
    if (goFiles.length === 0) return { exitCode: 0, files: { ...job.files } };

    const boundary = `--cp-${randomUUID()}--`;
    let captured = '';
    const capture: JobContext = {
      signal: ctx.signal,
      output: (text) => {
        if (captured.length + text.length > FORMAT_MAX_BYTES) return false;
        captured += text;
        return true;
      },
    };
    const script = `for f in "$@"; do printf '\\n%s %s\\n' '${boundary}' "$f"; gofumpt "/run/student/$f" 2>&1 || exit 3; done`;
    const result = await runEphemeral(
      {
        image: this.settings.go.image,
        env: [],
        entrypoint: ['/bin/sh', '-c', script, 'format'],
        cmd: goFiles,
        runDir: join(this.settings.runsDir, job.id),
        mountAt: '/run/student',
        files: Object.fromEntries(goFiles.map((n) => [n, job.files[n] ?? ''])),
        memoryMb: this.settings.memoryMb,
        cpus: this.settings.cpus,
        tmpfs: `rw,size=16m,mode=1777`,
        pidsLimit: 64,
        readonlyRootfs: true,
        noNewPrivileges: this.noNewPrivileges,
      },
      capture,
    );

    const sections = captured.split(`\n${boundary} `).slice(1);
    if (result.exitCode !== 0) {
      // The last section is the file that failed to parse; show its message, minus our paths.
      const last = sections.at(-1) ?? captured;
      const msg = last.slice(last.indexOf('\n') + 1).replaceAll('/run/student/', '').trim();
      return { exitCode: result.exitCode, error: msg || 'the file could not be parsed' };
    }
    const out: Record<string, string> = { ...job.files };
    for (const s of sections) {
      const nl = s.indexOf('\n');
      const name = s.slice(0, nl);
      if (name in out) out[name] = s.slice(nl + 1);
    }
    return { exitCode: 0, files: out };
  }
}
