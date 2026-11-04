/**
 * Java backend (V3 step 7, D30–D33): one ephemeral container per job from the
 * Java runner image (docker/runner-java), editor files mounted read-only at
 * /jail/student. The image's /app/run.sh copies them into a tmpfs workdir and
 * hands over to the official entrypoint, byte-identical: Submit runs the
 * official JUnit test through Maven, Run compiles and runs ExerciseRunner.
 * Pass/fail is the exit code (the entrypoint maps the harness's random exit
 * code to 0, so student code cannot fake a pass).
 */

import { join } from 'node:path';
import { runOnCloudRun } from './cloudrun.js';
import { probeNoNewPrivileges, requireImage, runEphemeral } from './ephemeral.js';
import type { runnerSettings as Settings } from './settings.js';
import type { Backend, BackendResult, Job, JobContext, RunnerLog } from './types.js';

export class JavaBackend implements Backend {
  readonly language = 'java' as const;
  private noNewPrivileges = false;

  constructor(
    private readonly settings: typeof Settings,
    private readonly log: RunnerLog,
  ) {}

  async preflight(): Promise<void> {
    if (this.settings.transport === 'cloudrun') {
      if (!this.settings.java.cloudRunUrl) throw new Error('RUNNER_BACKEND=cloudrun needs RUNNER_JAVA_CLOUDRUN_URL');
      return;
    }
    await requireImage(this.settings.java.image);
    this.noNewPrivileges = await probeNoNewPrivileges(this.settings.java.image);
    this.log.info('runner.java.ready', { image: this.settings.java.image, noNewPrivileges: this.noNewPrivileges });
  }

  async run(job: Job, ctx: JobContext): Promise<BackendResult> {
    if (job.kind === 'format') throw new Error('format is not supported for java');
    const editorFiles = job.exercise.editorFiles ?? Object.keys(job.files);
    const expectedFiles = job.exercise.expectedFiles ?? editorFiles;
    const className = job.exercise.className ?? job.slug;
    // Only editor files enter the jail — the official test is baked into the image.
    const files = Object.fromEntries(editorFiles.map((n) => [n, job.files[n] ?? '']));

    if (this.settings.transport === 'cloudrun') {
      return runOnCloudRun(
        this.settings.java.cloudRunUrl,
        { exercise: className, mode: job.kind === 'test' ? 'submit' : 'run', files, args: job.args, expectedFiles, editorFiles },
        ctx,
        this.log,
      );
    }

    return runEphemeral(
      {
        image: this.settings.java.image,
        env: [
          `EXERCISE=${className}`,
          // Submit copies these into the Maven project (upstream: EDITOR_FILES).
          `EDITOR_FILES=${editorFiles.join(',')}`,
          `CODE_EDITOR_RUN_ONLY=${job.kind === 'run' ? 'true' : 'false'}`,
        ],
        cmd: [],
        runDir: join(this.settings.runsDir, job.id),
        mountAt: '/jail/student',
        files,
        memoryMb: Math.max(this.settings.memoryMb, this.settings.java.memoryMb),
        cpus: this.settings.cpus,
        tmpfs: `rw,exec,size=${this.settings.java.tmpfsMb}m,mode=1777`,
        pidsLimit: 256,
        readonlyRootfs: true,
        noNewPrivileges: this.noNewPrivileges,
      },
      ctx,
    );
  }
}
