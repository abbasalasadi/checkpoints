/**
 * JS backend — the js-checkpoints reference runner: one ephemeral container per
 * job from the JS runner image (docker/runner-js), editor files mounted at
 * /jail/student, read-only rootfs. Pass/fail is the exit code.
 */

import { join } from 'node:path';
import { runOnCloudRun } from './cloudrun.js';
import { probeNoNewPrivileges, requireImage, runEphemeral } from './ephemeral.js';
import type { runnerSettings as Settings } from './settings.js';
import type { Backend, BackendResult, Job, JobContext, RunnerLog } from './types.js';

export class JsBackend implements Backend {
  readonly language = 'js' as const;
  private noNewPrivileges = false;

  constructor(
    private readonly settings: typeof Settings,
    private readonly log: RunnerLog,
  ) {}

  async preflight(): Promise<void> {
    if (this.settings.transport === 'cloudrun') {
      if (!this.settings.js.cloudRunUrl) throw new Error('RUNNER_BACKEND=cloudrun needs RUNNER_JS_CLOUDRUN_URL');
      return;
    }
    await requireImage(this.settings.js.image);
    this.noNewPrivileges = await probeNoNewPrivileges(this.settings.js.image);
    this.log.info('runner.js.ready', { image: this.settings.js.image, noNewPrivileges: this.noNewPrivileges });
  }

  async run(job: Job, ctx: JobContext): Promise<BackendResult> {
    if (job.kind === 'format') throw new Error('format is not supported for js');
    const editorFiles = job.exercise.editorFiles ?? Object.keys(job.files);
    const expectedFiles = job.exercise.expectedFiles ?? editorFiles;
    // Only editor files enter the jail — the test file is baked into the image.
    const files = Object.fromEntries(editorFiles.map((n) => [n, job.files[n] ?? '']));

    if (this.settings.transport === 'cloudrun') {
      return runOnCloudRun(
        this.settings.js.cloudRunUrl,
        {
          exercise: job.slug,
          mode: job.kind === 'test' ? 'submit' : 'run',
          files,
          args: job.args,
          expectedFiles,
          editorFiles,
        },
        ctx,
        this.log,
      );
    }

    return runEphemeral(
      {
        image: this.settings.js.image,
        env: [
          `EXERCISE=${job.slug}`,
          // Submit grades only the graded file; main.js never reaches the tester.
          `FILE=${expectedFiles.join(',')}`,
          // Run concatenates these in order: definitions first, then main.js.
          `EDITOR_FILES=${editorFiles.join(',')}`,
          `CODE_EDITOR_RUN_ONLY=${job.kind === 'run' ? 'true' : 'false'}`,
        ],
        cmd: job.kind === 'run' ? job.args : [],
        runDir: join(this.settings.runsDir, job.id),
        mountAt: '/jail/student',
        files,
        memoryMb: this.settings.memoryMb,
        cpus: this.settings.cpus,
        tmpfs: `rw,size=${this.settings.tmpfsMb}m,mode=1777`,
        pidsLimit: 128,
        readonlyRootfs: true,
        noNewPrivileges: this.noNewPrivileges,
      },
      ctx,
    );
  }
}
