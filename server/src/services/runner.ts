/**
 * The runner — one Docker container per student, with the three load controls
 * that keep a 1.9 GB VM (already hosting eleven other containers) alive.
 *
 *   concurrency cap   RUNNER_MAX_CONCURRENT   3 x ~125 MB peak, excess queues
 *   cool-down         RUNNER_COOLDOWN_SECONDS one student cannot hog the queue
 *   idle reaping      RUNNER_IDLE_SECONDS     containers do not accumulate
 *
 * Per-container cgroup limits are not only about fairness: they mean a runaway
 * build dies inside its own container rather than triggering the system
 * OOM-killer against one of the VM's other services.
 *
 * See docs/04-runner.md.
 */

import Docker from 'dockerode';
import { readFileSync } from 'node:fs';
import { freemem } from 'node:os';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { runnerUsage } from '../repositories/index.js';

const docker = new Docker();

export interface ExecResult {
  exitCode: number;
  output: string;
  durationMs: number;
  /** Output hit the byte cap: what is here is the beginning, not the whole. */
  truncated: boolean;
  /** Stopped by the student pressing Cancel rather than running to completion. */
  cancelled: boolean;
  /** Docker confirms the cgroup OOM killer stopped it — not merely exit 137. */
  oomKilled: boolean;
}

/** What a student pressed: `cargo run` (execute) or `cargo test` (graded). */
export type RunKind = 'run' | 'test';

export class CooldownError extends Error {
  constructor(public readonly secondsRemaining: number) {
    super(`cooling down, ${secondsRemaining}s remaining`);
    this.name = 'CooldownError';
  }
}

/**
 * The run outlived RUNNER_TIMEOUT_SECONDS and was killed.
 *
 * Distinct from a generic failure because it means something specific and
 * actionable — almost always a loop that never ends. Reported as a generic
 * "the runner is unavailable", it told the student their code was fine and our
 * infrastructure was broken, which is exactly backwards.
 */
export class RunTimeoutError extends Error {
  constructor(public readonly seconds: number) {
    super(`run exceeded ${seconds}s`);
    this.name = 'RunTimeoutError';
  }
}

/**
 * How much output one run may produce before it is cut off.
 *
 * `loop { println!(...) }` is an ordinary beginner mistake, and without a cap
 * it grew the backend by ~32 MB/s — past the VM's free memory in under a
 * minute, taking the site down for every student, not just its author.
 */
const MAX_OUTPUT_BYTES = 1024 * 1024;

/**
 * If this much arrives without a parseable frame, treat the stream as unframed
 * rather than buffering in the hope of a header that is never coming.
 */
const FRAME_FALLBACK_BYTES = 64 * 1024;

/** Where the wrapper shell records its process group id, inside the container. */
const PGID_FILE = '/tmp/rc-run.pgid';

interface Entry {
  containerId: string;
  lastUsedAt: number;
  /**
   * Open terminal sessions. A container with an attached terminal is in use
   * even when no command is running — without this the reaper kills the
   * container out from under a live PTY, which surfaces to the student as a
   * sudden "[terminal disconnected]" (exit 137).
   */
  terminals: number;
}

export class Runner {
  private readonly containers = new Map<string, Entry>();
  /**
   * Last run per user *per kind*, keyed `<userId>:<kind>`.
   *
   * The two clocks are deliberately independent. A shared clock would mean a
   * student who pressed Run to check their work then had to wait out the much
   * longer Test window before submitting it — punishing exactly the habit the
   * Run button exists to encourage.
   */
  private readonly lastRunAt = new Map<string, number>();
  /** Students with a run in flight, so Cancel and the timeout can stop it. */
  private readonly running = new Map<string, { containerId: string; cancelled: boolean }>();
  /**
   * Students waiting for a free slot. The POST simply blocks in acquireSlot(),
   * so without this the UI says "Running…" while nothing of theirs is running —
   * and at capacity that silence is exactly when a student needs an explanation.
   */
  private readonly queued = new Set<string>();
  private readonly waiting: (() => void)[] = [];
  private active = 0;
  private reaper: NodeJS.Timeout | null = null;

  /** Verify Docker and the image are usable. Called at startup so a broken
   *  runner surfaces immediately rather than on a student's first click. */
  async preflight(): Promise<void> {
    await docker.ping();
    const image = config.runner.image;
    const images = await docker.listImages({ filters: { reference: [image] } });
    if (images.length === 0) {
      throw new Error(`runner image not found: ${image} — run \`make runner-build\``);
    }
    logger.info('runner.preflight.ok', { image });
    this.checkMemoryBudget();
  }

  /**
   * Warn if the configured concurrency could outrun the host's memory.
   *
   * RUNNER_MAX_CONCURRENT x RUNNER_MEMORY_MB is the worst case this service can
   * demand. Exceeding what the host has does not fail politely: the kernel OOM
   * killer picks a victim by size, and on a shared box that victim is as likely
   * to be somebody else's service as ours.
   *
   * Measured on the heaviest exercise (brackets_matching, compiling rand and
   * zerocopy cold): 311 MiB peak against the 384 MiB cap. So the cap is real —
   * budget by it, not by a hoped-for average.
   *
   * A warning, not a refusal: the operator may be deploying to a bigger box, or
   * may accept the risk knowingly. Refusing to start would be worse than saying so.
   */
  private checkMemoryBudget(): void {
    const budgetMb = config.runner.maxConcurrent * config.runner.memoryMb;
    const availableMb = Math.round(availableMemoryBytes() / (1024 * 1024));
    if (availableMb <= 0) return;

    // 85%, not two thirds. The question this answers is "would the worst case
    // exhaust what the host can hand out", not "is it using a lot" — and the
    // first threshold tried (66%) called 2 x 384 tight against 1.1 GB and
    // advised dropping to 1, which would serialise a whole cohort to avoid a
    // risk that 343 MB of headroom plus 8 GB of swap already covers. A guard
    // that recommends something you would not do is one you learn to ignore.
    const safeMb = Math.round(availableMb * 0.85);
    const fields = {
      maxConcurrent: config.runner.maxConcurrent,
      memoryMbEach: config.runner.memoryMb,
      worstCaseMb: budgetMb,
      availableMb,
    };
    if (budgetMb > safeMb) {
      logger.warn('runner.memory_budget.tight', {
        ...fields,
        advice: `lower RUNNER_MAX_CONCURRENT to ${Math.max(1, Math.floor(safeMb / config.runner.memoryMb))}`,
      });
    } else {
      logger.info('runner.memory_budget.ok', fields);
    }
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

  // ── cool-down ──────────────────────────────────────────────────────────────

  /** The window a given kind must wait out. */
  static cooldownFor(kind: RunKind): number {
    return kind === 'test' ? config.runner.cooldownTestSeconds : config.runner.cooldownRunSeconds;
  }

  /** Seconds still to wait for this kind, or 0 if the student may run now. */
  cooldownRemaining(userId: string, kind: RunKind): number {
    const last = this.lastRunAt.get(`${userId}:${kind}`);
    if (last === undefined) return 0;
    const elapsed = (Date.now() - last) / 1000;
    const remaining = Runner.cooldownFor(kind) - elapsed;
    return remaining > 0 ? Math.ceil(remaining) : 0;
  }

  /** Clear both clocks for a user. Only tools/verify-runner.ts needs this. */
  clearCooldown(userId: string): void {
    for (const kind of ['run', 'test'] as const) this.lastRunAt.delete(`${userId}:${kind}`);
  }

  /** Students currently waiting for a slot. Surfaced to the UI as queue depth. */
  get queueDepth(): number {
    return this.waiting.length;
  }

  get activeRuns(): number {
    return this.active;
  }

  // ── containers ─────────────────────────────────────────────────────────────

  /**
   * One container per user, created lazily. A second browser tab reuses the
   * existing container rather than starting a second one — on this VM that
   * restraint matters more than it would on a metered service.
   */
  async ensureContainer(userId: string): Promise<string> {
    const existing = this.containers.get(userId);
    if (existing) {
      // Trusting the cached id was enough until the container went away behind
      // our back — `docker system prune`, a daemon restart, a manual rm. The id
      // then stuck in this map and EVERY later run for that student failed with
      // "no such container" until the service was restarted. One inspect against
      // the local socket is far cheaper than that failure mode.
      try {
        const state = await docker.getContainer(existing.containerId).inspect();
        if (state.State.Running) {
          existing.lastUsedAt = Date.now();
          return existing.containerId;
        }
      } catch {
        // Gone. Fall through and build a new one.
      }
      logger.warn('runner.container.vanished', {
        userId,
        containerId: existing.containerId.slice(0, 12),
      });
      this.containers.delete(userId);
    }

    const started = Date.now();
    const container = await docker.createContainer({
      Image: config.runner.image,
      // Keep the container alive so successive runs reuse it; each run is a
      // `docker exec` rather than a fresh container start.
      Cmd: ['sleep', 'infinity'],
      User: '10001',
      WorkingDir: '/workspace',
      Labels: { 'rust-checkpoints.user': userId },
      HostConfig: {
        Memory: config.runner.memoryMb * 1024 * 1024,
        MemorySwap: config.runner.memoryMb * 1024 * 1024, // no swap escape hatch
        NanoCpus: Math.round(config.runner.cpus * 1e9),
        PidsLimit: 256,
        NetworkMode: 'none',
        CapDrop: ['ALL'],
        // no-new-privileges is deliberately absent: it breaks exec for non-root
        // users on Docker 29.x. The image has its setuid bits stripped instead,
        // which removes the escalation path rather than blocking it at runtime.
        ReadonlyRootfs: true,
        // Disk-backed, not tmpfs: target/ is ~15 MB per exercise and RAM is the
        // scarce resource here.
        Mounts: [
          { Type: 'volume', Target: '/workspace', Source: `rc-work-${userId}`, ReadOnly: false },
        ],
        // /tmp stays small and in memory — cargo needs somewhere writable.
        Tmpfs: { '/tmp': 'rw,size=32m' },
      },
    });

    await container.start();
    this.containers.set(userId, { containerId: container.id, lastUsedAt: Date.now(), terminals: 0 });
    // How long a student actually holds a container is the number every sizing
    // decision needs — and the one thing neither the attempts table nor the
    // journal records. The repository for it existed but was never called, so
    // runner_usage sat empty through 5,552 attempts.
    try {
      runnerUsage.open(Number(userId), container.id);
    } catch (err) {
      // Accounting must never be able to stop a student's run.
      logger.warn('runner.usage.open_failed', { userId, error: String(err) });
    }
    logger.info('runner.container.created', {
      userId,
      containerId: container.id.slice(0, 12),
      ms: Date.now() - started,
    });
    return container.id;
  }

  async release(userId: string): Promise<void> {
    const entry = this.containers.get(userId);
    if (!entry) return;
    this.containers.delete(userId);
    try {
      runnerUsage.close(entry.containerId);
    } catch (err) {
      logger.warn('runner.usage.close_failed', { userId, error: String(err) });
    }
    try {
      const c = docker.getContainer(entry.containerId);
      await c.remove({ force: true, v: false });
      logger.info('runner.container.removed', { userId, containerId: entry.containerId.slice(0, 12) });
    } catch (err) {
      logger.warn('runner.container.remove_failed', { userId, error: String(err) });
    }
  }

  /**
   * Mark a terminal as attached. While at least one is open the container is
   * held, subject to the longer terminal idle timeout below.
   */
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

  /** Record activity — keystrokes and output count as use. */
  touch(userId: string): void {
    const entry = this.containers.get(userId);
    if (entry) entry.lastUsedAt = Date.now();
  }

  private async reapIdle(): Promise<void> {
    const now = Date.now();
    for (const [userId, entry] of [...this.containers.entries()]) {
      // NEVER reap a container with a run in flight.
      //
      // `lastUsedAt` is only refreshed when a run FINISHES, so during a long one
      // it goes stale and the container was reaped out from under the exec at 60
      // seconds. With RUNNER_IDLE_SECONDS below RUNNER_TIMEOUT_SECONDS that made
      // the timeout unreachable: every long run died at 60s with exit 137
      // instead of timing out at 120s, and was then reported as "out of memory".
      // The same protection terminals already had, for the same reason.
      if (this.running.has(userId)) continue;

      // A container with an open terminal gets a much longer grace period: the
      // student is present. Without it, sitting and reading for a minute killed
      // their session. It is still bounded, so a tab left open overnight does
      // not hold memory on a 1.9 GB VM forever.
      const idleLimit =
        entry.terminals > 0 ? config.runner.terminalIdleSeconds : config.runner.idleSeconds;

      const idleSeconds = Math.round((now - entry.lastUsedAt) / 1000);
      if (idleSeconds >= idleLimit) {
        logger.info('runner.container.idle_reap', {
          userId,
          idleSeconds,
          idleLimit,
          hadTerminal: entry.terminals > 0,
        });
        await this.release(userId);
      }
    }
  }

  // ── concurrency ────────────────────────────────────────────────────────────

  private async acquireSlot(): Promise<() => void> {
    if (this.active < config.runner.maxConcurrent) {
      this.active += 1;
      return () => this.releaseSlot();
    }
    await new Promise<void>((resolve) => this.waiting.push(resolve));
    this.active += 1;
    return () => this.releaseSlot();
  }

  private releaseSlot(): void {
    this.active -= 1;
    const next = this.waiting.shift();
    if (next) next();
  }

  // ── writing files and running commands ─────────────────────────────────────

  /**
   * Write files into the container. Used to materialise an exercise: the
   * student's code plus a pristine copy of the test crate, which is rewritten
   * on every run so assertions cannot be weakened.
   */
  async writeFiles(userId: string, files: { path: string; content: string }[]): Promise<void> {
    const id = await this.ensureContainer(userId);
    const container = docker.getContainer(id);
    const pack = buildTar(files);
    await container.putArchive(pack, { path: '/workspace' });
  }

  /**
   * Run a command in the student's container, subject to cool-down and the
   * concurrency cap. Returns the exit code — pass/fail comes from that, not
   * from parsing test output.
   */
  async exec(
    userId: string,
    cmd: string[],
    opts: { cwd?: string; kind?: RunKind } = {},
  ): Promise<ExecResult> {
    // Defaults to the shorter window: a caller that does not say which kind it
    // is gets the permissive one rather than silently inheriting Test's longer window.
    const kind: RunKind = opts.kind ?? 'run';
    const cooling = this.cooldownRemaining(userId, kind);
    if (cooling > 0) throw new CooldownError(cooling);

    this.queued.add(userId);
    let release: () => void;
    try {
      release = await this.acquireSlot();
    } finally {
      this.queued.delete(userId);
    }

    const started = Date.now();
    let id = '';
    try {
      id = await this.ensureContainer(userId);
      this.running.set(userId, { containerId: id, cancelled: false });

      const container = docker.getContainer(id);
      const exec = await container.exec({
        // Wrapped so the run has a process group we can signal. Without this
        // the timeout only stopped *waiting* — the program kept running, and a
        // student clicking Run again simply stacked another one beside it.
        //
        // `kill` is a shell builtin, so cancelling needs nothing added to the
        // image (which has no ps/pkill).
        Cmd: ['/bin/sh', '-c', `echo $$ > ${PGID_FILE}; exec ${shellQuote(cmd)}`],
        WorkingDir: opts.cwd ?? '/workspace',
        AttachStdout: true,
        AttachStderr: true,
      });

      const stream = await exec.start({ hijack: true, Detach: false });

      let collected;
      try {
        collected = await collect(stream, config.runner.timeoutSeconds * 1000, MAX_OUTPUT_BYTES);
      } catch (err) {
        // Whatever went wrong, the program is still running in the container.
        await this.terminate(id);
        if (err instanceof RunTimeoutError) {
          logger.warn('runner.timeout', { userId, cmd: cmd.join(' '), seconds: err.seconds });
        }
        throw err;
      }

      // Output cap reached: we stopped reading, so stop the program too.
      if (collected.truncated) {
        await this.terminate(id);
        logger.warn('runner.output_capped', { userId, cmd: cmd.join(' '), bytes: MAX_OUTPUT_BYTES });
      }

      const cancelled = this.running.get(userId)?.cancelled ?? false;
      const info = await exec.inspect();

      // Exit 137 is SIGKILL, which is NOT proof of OOM — the reaper, a manual
      // stop and the cgroup killer all look identical from the exit code. Ask
      // Docker whether the container was actually OOM-killed rather than
      // guessing, or a reaped run gets reported as "your program ran out of
      // memory" when it did nothing of the kind.
      let oomKilled = false;
      if ((info.ExitCode ?? 0) === 137) {
        try {
          oomKilled = (await container.inspect()).State.OOMKilled === true;
        } catch {
          // Container already gone; leave it false rather than assert a cause.
        }
      }

      const entry = this.containers.get(userId);
      if (entry) entry.lastUsedAt = Date.now();

      const result = {
        exitCode: info.ExitCode ?? -1,
        output: collected.output,
        durationMs: Date.now() - started,
        truncated: collected.truncated,
        cancelled,
        oomKilled,
      };
      logger.info('runner.exec', {
        userId,
        cmd: cmd.join(' '),
        exitCode: result.exitCode,
        ms: result.durationMs,
        ...(result.truncated ? { truncated: true } : {}),
        ...(result.cancelled ? { cancelled: true } : {}),
        // A bare exit code is not diagnosable: 101 covers a compile error, a
        // panic and a failing test alike. Record the first line that says which,
        // bounded so a noisy build cannot flood the log.
        ...(result.exitCode !== 0 ? { reason: firstFailureLine(result.output) } : {}),
      });
      return result;
    } finally {
      this.running.delete(userId);
      // Anchored to the END of the run, not the start. Anchored to the start, a
      // 120-second timeout left the cool-down expired 115 seconds ago, so a
      // runaway could be re-fired the instant it was killed.
      this.lastRunAt.set(`${userId}:${kind}`, Date.now());
      release();
    }
  }

  /** True if this student has a run in flight — what Cancel needs to know. */
  isRunning(userId: string): boolean {
    return this.running.has(userId);
  }

  /** True while this student's run is waiting for a slot rather than executing. */
  isQueued(userId: string): boolean {
    return this.queued.has(userId);
  }

  /**
   * Stop this student's in-flight run. Returns false if there was nothing to
   * stop, so the caller can say so rather than implying it cancelled something.
   */
  async cancel(userId: string): Promise<boolean> {
    const entry = this.running.get(userId);
    if (!entry) return false;
    entry.cancelled = true;
    await this.terminate(entry.containerId);
    logger.info('runner.cancelled', { userId });
    return true;
  }

  /**
   * Signal the whole process group, so `cargo run` takes its child binary with
   * it. TERM first, then KILL — a program ignoring TERM must not survive.
   *
   * Best-effort: if the container is already gone there is nothing to kill, and
   * failing here must not mask the error that led us to terminate.
   */
  private async terminate(containerId: string): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      const exec = await container.exec({
        Cmd: [
          '/bin/sh',
          '-c',
          `p=$(cat ${PGID_FILE} 2>/dev/null) || exit 0; kill -TERM -$p 2>/dev/null; sleep 1; kill -KILL -$p 2>/dev/null; exit 0`,
        ],
        AttachStdout: false,
        AttachStderr: false,
      });
      await exec.start({ Detach: true });
    } catch (err) {
      logger.warn('runner.terminate_failed', { containerId: containerId.slice(0, 12), error: String(err) });
    }
  }
}

// ── helpers ──────────────────────────────────────────────────────────────────

/**
 * Memory the host can actually hand out.
 *
 * `os.freemem()` under-reports badly on Linux — it excludes reclaimable page
 * cache, which on this VM is hundreds of MB. MemAvailable is the kernel's own
 * estimate of what a new allocation could get, so it is preferred where present.
 */
function availableMemoryBytes(): number {
  try {
    const meminfo = readFileSync('/proc/meminfo', 'utf8');
    const m = /^MemAvailable:\s+(\d+) kB$/m.exec(meminfo);
    if (m?.[1]) return Number(m[1]) * 1024;
  } catch {
    // Not Linux, or /proc unavailable — fall back.
  }
  return freemem();
}

/** The first line explaining a failure, stripped of colour and truncated. */
function firstFailureLine(output: string): string {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, '');
  const patterns = [/^error(\[E\d+\])?:.*$/m, /^thread .*panicked at.*$/m, /^test result: FAILED.*$/m];
  for (const re of patterns) {
    const m = re.exec(plain);
    if (m) return m[0].slice(0, 200);
  }
  const tail = plain.trim().split('\n').pop() ?? '';
  return tail.slice(0, 200);
}

/**
 * Minimal ustar writer — avoids a dependency for something this small.
 *
 * Two details that are easy to get wrong and both bit us:
 *   - uid/gid fields are OCTAL. Writing the decimal digits "0010001" yields
 *     uid 4097, not 10001, and every extracted file lands owned by a stranger.
 *   - directory entries must be emitted explicitly. Without them Docker creates
 *     parents as root, and the non-root runner cannot then write target/ inside.
 */
const TAR_UID = 10001;

function octal(value: number, width: number): string {
  return `${value.toString(8).padStart(width - 1, '0')}\0`;
}

function tarHeader(path: string, size: number, type: '0' | '5', mode: number): Buffer {
  const header = Buffer.alloc(512);
  header.write(path.replace(/^\//, ''), 0, 100, 'utf8');
  header.write(octal(mode, 8), 100, 8, 'utf8');
  header.write(octal(TAR_UID, 8), 108, 8, 'utf8');
  header.write(octal(TAR_UID, 8), 116, 8, 'utf8');
  header.write(octal(size, 12), 124, 12, 'utf8');
  header.write(octal(Math.floor(Date.now() / 1000), 12), 136, 12, 'utf8');
  header.write('        ', 148, 8, 'utf8'); // checksum placeholder, counted as spaces
  header.write(type, 156, 1, 'utf8');
  header.write('ustar\0', 257, 6, 'utf8');
  header.write('00', 263, 2, 'utf8');

  let sum = 0;
  for (const b of header) sum += b;
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148, 8, 'utf8');
  return header;
}

function buildTar(files: { path: string; content: string }[]): Buffer {
  const blocks: Buffer[] = [];

  // Every ancestor directory, shallowest first, owned by the runner user.
  const dirs = new Set<string>();
  for (const f of files) {
    const parts = f.path.replace(/^\//, '').split('/');
    parts.pop();
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      dirs.add(acc);
    }
  }
  for (const d of [...dirs].sort((a, b) => a.split('/').length - b.split('/').length)) {
    blocks.push(tarHeader(`${d}/`, 0, '5', 0o755));
  }

  for (const file of files) {
    const content = Buffer.from(file.content, 'utf8');
    blocks.push(tarHeader(file.path, content.length, '0', 0o644));
    blocks.push(content);
    const pad = (512 - (content.length % 512)) % 512;
    if (pad) blocks.push(Buffer.alloc(pad));
  }

  blocks.push(Buffer.alloc(1024)); // end of archive
  return Buffer.concat(blocks);
}

/**
 * Demultiplex Docker's stdout/stderr stream, with a wall-clock timeout and a
 * hard cap on how much is buffered.
 *
 * The cap and the detach below are not tuning — they are the difference between
 * one student's runaway `println!` loop and an outage. Previously this buffered
 * without limit AND left its `data` listener attached after the timeout
 * rejected, so the buffer kept growing after the request was over: measured at
 * ~32 MB/s, still climbing through 3 GB. Rejecting a promise does not stop a
 * stream; it has to be detached and destroyed.
 */
function collect(
  stream: NodeJS.ReadableStream,
  timeoutMs: number,
  maxBytes: number,
): Promise<{ output: string; truncated: boolean }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    /** Bytes of a frame that arrived split across events. */
    let pending: Buffer = Buffer.alloc(0);
    let total = 0;
    let done = false;

    /** Detach and destroy. Every exit from here goes through it exactly once. */
    const finish = (fn: () => void) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      stream.removeListener('data', onData);
      stream.removeListener('end', onEnd);
      stream.removeListener('error', onError);
      (stream as unknown as { destroy?: () => void }).destroy?.();
      fn();
    };

    const timer = setTimeout(
      () => finish(() => reject(new RunTimeoutError(Math.round(timeoutMs / 1000)))),
      timeoutMs,
    );

    const onData = (c: Buffer) => {
      // Docker frames non-tty streams with an 8-byte header, but a frame is NOT
      // guaranteed to arrive whole: under sustained output the payload splits
      // across events. Parsing each event independently over-counted the length,
      // dropped the tail, and then read the next event's first bytes as a
      // header — turning a student's own output into garbage exactly when there
      // was a lot of it. So partial frames are carried over instead.
      pending = pending.length === 0 ? c : Buffer.concat([pending, c]);

      let offset = 0;
      while (offset + 8 <= pending.length) {
        const len = pending.readUInt32BE(offset + 4);
        if (offset + 8 + len > pending.length) break; // incomplete: wait for more
        chunks.push(pending.subarray(offset + 8, offset + 8 + len));
        total += len;
        offset += 8 + len;
      }
      pending = offset === 0 ? pending : pending.subarray(offset);

      // A stream with no framing at all (a tty) never yields a complete frame;
      // fall back to taking it verbatim rather than buffering it forever.
      if (offset === 0 && pending.length > FRAME_FALLBACK_BYTES) {
        chunks.push(pending);
        total += pending.length;
        pending = Buffer.alloc(0);
      }

      if (total >= maxBytes) {
        finish(() =>
          resolve({
            output: Buffer.concat(chunks).subarray(0, maxBytes).toString('utf8'),
            truncated: true,
          }),
        );
      }
    };

    const onEnd = () => finish(() => resolve({ output: Buffer.concat(chunks).toString('utf8'), truncated: false }));
    const onError = (e: Error) => finish(() => reject(e));

    stream.on('data', onData);
    stream.on('end', onEnd);
    stream.on('error', onError);
  });
}

/**
 * Quote an argv for `sh -c`. The command is ours, not student input, but it
 * carries a slug into a shell string — so it is quoted rather than trusted.
 */
function shellQuote(argv: string[]): string {
  return argv.map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');
}

export const runner = new Runner();
