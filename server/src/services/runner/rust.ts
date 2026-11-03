/**
 * Rust backend — the rust-checkpoints reference runner: one WARM container per
 * student (cargo's target/ survives between runs), each run a `docker exec`.
 *
 *   idle reaping      RUNNER_IDLE_SECONDS     containers do not accumulate
 *   terminals         an attached PTY holds the container (RUNNER_TERMINAL_IDLE_SECONDS)
 *   cgroup limits     a runaway build dies inside its own container, not the VM
 *
 * Queueing, cooldown, timeout and the output cap moved to the dispatcher; this
 * class keeps the container lifecycle and the exec itself. Comments from the
 * reference that explain a past failure are kept, shortened.
 */

import Docker from 'dockerode';
import { readFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { buildTar, pumpStream, shellQuote } from './docker-stream.js';
import type { Backend, BackendResult, Job, JobContext, RunnerLog } from './types.js';

/** Where the wrapper shell records its process group id, inside the container. */
const PGID_FILE = '/tmp/rc-run.pgid';

export interface RustSettings {
  image: string;
  memoryMb: number;
  cpus: number;
  maxConcurrent: number;
  idleSeconds: number;
  terminalIdleSeconds: number;
}

/** Accounting hooks (runner_usage table). Optional so tests need no DB. */
export interface UsageHooks {
  open(userId: number, containerId: string): void;
  close(containerId: string): void;
}

interface Entry {
  containerId: string;
  lastUsedAt: number;
  /** Open terminal sessions: a container with a live PTY is in use even when idle. */
  terminals: number;
}

export class RustBackend implements Backend {
  readonly language = 'rust' as const;
  /** Jobs share the user's /workspace, so one at a time per user. */
  readonly exclusivePerUser = true;

  private readonly docker = new Docker();
  private readonly containers = new Map<string, Entry>();
  /** Users with an exec in flight: never reaped. */
  private readonly running = new Set<string>();
  private reaper: NodeJS.Timeout | null = null;

  constructor(
    private readonly settings: RustSettings,
    private readonly log: RunnerLog,
    private readonly usage?: UsageHooks,
  ) {}

  async preflight(): Promise<void> {
    await this.docker.ping();
    const images = await this.docker.listImages({ filters: { reference: [this.settings.image] } });
    if (images.length === 0) throw new Error(`runner image not found: ${this.settings.image}`);
    this.log.info('runner.rust.ready', { image: this.settings.image });
    this.checkMemoryBudget();
  }

  /** Warn (never refuse) if concurrency x memory cap could outrun the host. */
  private checkMemoryBudget(): void {
    const budgetMb = this.settings.maxConcurrent * this.settings.memoryMb;
    const availableMb = Math.round(availableMemoryBytes() / (1024 * 1024));
    if (availableMb <= 0) return;
    const safeMb = Math.round(availableMb * 0.85);
    const fields = { maxConcurrent: this.settings.maxConcurrent, memoryMbEach: this.settings.memoryMb, worstCaseMb: budgetMb, availableMb };
    if (budgetMb > safeMb) this.log.warn('runner.memory_budget.tight', fields);
    else this.log.info('runner.memory_budget.ok', fields);
  }

  start(): void {
    if (this.reaper) return;
    this.reaper = setInterval(() => void this.reapIdle(), 10_000);
    this.reaper.unref();
  }

  async stop(): Promise<void> {
    if (this.reaper) clearInterval(this.reaper);
    this.reaper = null;
    await Promise.all([...this.containers.keys()].map((u) => this.release(u)));
  }

  // ── containers ───────────────────────────────────────────────────────────

  /** One container per user, created lazily, re-created if it vanished behind our back. */
  async ensureContainer(userId: string): Promise<string> {
    const existing = this.containers.get(userId);
    if (existing) {
      try {
        const state = await this.docker.getContainer(existing.containerId).inspect();
        if (state.State.Running) {
          existing.lastUsedAt = Date.now();
          return existing.containerId;
        }
      } catch {
        // Gone: build a new one.
      }
      this.log.warn('runner.container.vanished', { userId, containerId: existing.containerId.slice(0, 12) });
      this.containers.delete(userId);
    }

    const started = Date.now();
    const container = await this.docker.createContainer({
      Image: this.settings.image,
      Cmd: ['sleep', 'infinity'],
      User: '10001',
      WorkingDir: '/workspace',
      Labels: { 'checkpoints.user': userId, 'checkpoints.language': 'rust' },
      HostConfig: {
        Memory: this.settings.memoryMb * 1024 * 1024,
        MemorySwap: this.settings.memoryMb * 1024 * 1024,
        NanoCpus: Math.round(this.settings.cpus * 1e9),
        PidsLimit: 256,
        NetworkMode: 'none',
        CapDrop: ['ALL'],
        // no-new-privileges breaks exec for non-root on Docker 29.x; the image strips setuid bits instead.
        ReadonlyRootfs: true,
        // Disk-backed: target/ is ~15 MB per exercise and RAM is the scarce resource.
        Mounts: [{ Type: 'volume', Target: '/workspace', Source: `rc-work-${userId}`, ReadOnly: false }],
        Tmpfs: { '/tmp': 'rw,size=32m' },
      },
    });
    await container.start();
    this.containers.set(userId, { containerId: container.id, lastUsedAt: Date.now(), terminals: 0 });
    try {
      this.usage?.open(Number(userId), container.id);
    } catch (err) {
      this.log.warn('runner.usage.open_failed', { userId, error: String(err) });
    }
    this.log.info('runner.container.created', { userId, containerId: container.id.slice(0, 12), ms: Date.now() - started });
    return container.id;
  }

  async release(userId: string): Promise<void> {
    const entry = this.containers.get(userId);
    if (!entry) return;
    this.containers.delete(userId);
    try {
      this.usage?.close(entry.containerId);
    } catch (err) {
      this.log.warn('runner.usage.close_failed', { userId, error: String(err) });
    }
    try {
      await this.docker.getContainer(entry.containerId).remove({ force: true, v: false });
      this.log.info('runner.container.removed', { userId, containerId: entry.containerId.slice(0, 12) });
    } catch (err) {
      this.log.warn('runner.container.remove_failed', { userId, error: String(err) });
    }
  }

  attachTerminal(userId: string): void {
    const entry = this.containers.get(userId);
    if (!entry) return;
    entry.terminals += 1;
    entry.lastUsedAt = Date.now();
  }

  detachTerminal(userId: string): void {
    const entry = this.containers.get(userId);
    if (!entry) return;
    entry.terminals = Math.max(0, entry.terminals - 1);
    entry.lastUsedAt = Date.now();
  }

  touch(userId: string): void {
    const entry = this.containers.get(userId);
    if (entry) entry.lastUsedAt = Date.now();
  }

  private async reapIdle(): Promise<void> {
    const now = Date.now();
    for (const [userId, entry] of [...this.containers.entries()]) {
      // Never reap under a run in flight: lastUsedAt only refreshes when a run ends.
      if (this.running.has(userId)) continue;
      const idleLimit = entry.terminals > 0 ? this.settings.terminalIdleSeconds : this.settings.idleSeconds;
      const idleSeconds = Math.round((now - entry.lastUsedAt) / 1000);
      if (idleSeconds >= idleLimit) {
        this.log.info('runner.container.idle_reap', { userId, idleSeconds, idleLimit, hadTerminal: entry.terminals > 0 });
        await this.release(userId);
      }
    }
  }

  /** Write files into the user's /workspace (the student's code plus a pristine test crate). */
  async writeFiles(userId: string, files: { path: string; content: string }[]): Promise<void> {
    const id = await this.ensureContainer(userId);
    await this.docker.getContainer(id).putArchive(buildTar(files), { path: '/workspace' });
  }

  // ── the job ──────────────────────────────────────────────────────────────

  async run(job: Job, ctx: JobContext): Promise<BackendResult> {
    if (job.kind === 'format') throw new Error('format is not supported for rust');
    const userId = job.user;
    const files = Object.entries(job.files).map(([path, content]) => ({ path, content }));
    if (files.length) await this.writeFiles(userId, files);
    if (ctx.signal.aborted) return { exitCode: null };

    const { cmd, cwd } = job.raw ?? cargoCommand(job);
    const id = await this.ensureContainer(userId);
    const container = this.docker.getContainer(id);
    this.running.add(userId);
    const onAbort = () => void this.terminate(id);
    try {
      const exec = await container.exec({
        // Wrapped so the run has a process group to signal (`kill` is a shell builtin).
        Cmd: ['/bin/sh', '-c', `echo $$ > ${PGID_FILE}; exec ${shellQuote(cmd)}`],
        WorkingDir: cwd ?? '/workspace',
        AttachStdout: true,
        AttachStderr: true,
      });
      const stream = await exec.start({ hijack: true, Detach: false });
      ctx.signal.addEventListener('abort', onAbort, { once: true });
      await pumpStream(stream, (text) => void ctx.output(text), ctx.signal);
      if (ctx.signal.aborted) return { exitCode: null };

      const info = await exec.inspect();
      const exitCode = info.ExitCode ?? -1;
      // 137 is SIGKILL, not proof of OOM: ask Docker.
      let oomKilled = false;
      if (exitCode === 137) {
        oomKilled = (await container.inspect().catch(() => null))?.State?.OOMKilled === true;
      }
      return { exitCode, oomKilled };
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
      this.running.delete(userId);
      const entry = this.containers.get(userId);
      if (entry) entry.lastUsedAt = Date.now();
    }
  }

  /** TERM then KILL the run's process group, so `cargo run` takes its child with it. Best-effort. */
  private async terminate(containerId: string): Promise<void> {
    try {
      const exec = await this.docker.getContainer(containerId).exec({
        Cmd: ['/bin/sh', '-c', `p=$(cat ${PGID_FILE} 2>/dev/null) || exit 0; kill -TERM -$p 2>/dev/null; sleep 1; kill -KILL -$p 2>/dev/null; exit 0`],
        AttachStdout: false,
        AttachStderr: false,
      });
      await exec.start({ Detach: true });
    } catch (err) {
      this.log.warn('runner.terminate_failed', { containerId: containerId.slice(0, 12), error: String(err) });
    }
  }
}

/** The reference's commands: `cargo test` in <slug>_test, `cargo run -- args` in <slug>. */
export function cargoCommand(job: Pick<Job, 'kind' | 'slug' | 'args'>): { cmd: string[]; cwd: string } {
  return job.kind === 'test'
    ? { cmd: ['cargo', 'test', '--offline', '--color', 'always'], cwd: `/workspace/${job.slug}_test` }
    : { cmd: ['cargo', 'run', '--offline', '--color', 'always', '--', ...job.args], cwd: `/workspace/${job.slug}` };
}

/** MemAvailable, since os.freemem() excludes reclaimable page cache. */
function availableMemoryBytes(): number {
  try {
    const m = /^MemAvailable:\s+(\d+) kB$/m.exec(readFileSync('/proc/meminfo', 'utf8'));
    if (m?.[1]) return Number(m[1]) * 1024;
  } catch {
    // not Linux
  }
  return freemem();
}
