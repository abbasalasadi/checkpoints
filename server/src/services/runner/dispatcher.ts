/**
 * The run dispatcher: one global queue in front of every language backend.
 *
 *   concurrency   limits.maxConcurrent jobs execute at once (all languages, format included)
 *   cooldown      per user per mode, counted from the END of the run (D15); while a
 *                 run is queued or running its whole window is still ahead
 *   limits        wall-clock timeout and output cap are enforced here, not in the backends:
 *                 the backend only has to honour `ctx.signal` by killing its process
 *   cancel        queued jobs are dropped; running jobs are aborted through the signal
 *   events        every run has an EventEmitter emitting 'event' with a RunEvent
 *                 ({type:'state'|'output'|'done'}) — what /ws/runs/:id forwards
 *
 * Pure: no config, logger or Docker imports, so it is tested with a fake backend.
 */

import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import {
  BusyError,
  CooldownError,
  QueueFullError,
  UnknownLanguageError,
  type Backend,
  type BackendResult,
  type Job,
  type Language,
  type Limits,
  type Outcome,
  type RunEvent,
  type RunMode,
  type RunRecord,
  type RunnerLog,
  type SubmitRunInput,
} from './types.js';

/** A backend that ignores its abort signal is given this long before its slot is reclaimed. */
const ABORT_GRACE_MS = 10_000;
/** Format is a pure text rewrite; anything slower than this is stuck. */
const FORMAT_TIMEOUT_MS = 15_000;

const ABORT_OUTCOMES = new Set<Outcome>(['cancelled', 'timeout', 'output_limit']);

const silent: RunnerLog = { info() {}, warn() {}, error() {} };

interface Entry {
  run: RunRecord;
  job: Job;
  backend: Backend;
  controller: AbortController;
  /** Wall-clock limit for this job. */
  timeoutMs: number;
}

export interface FormatResult {
  ok: boolean;
  files?: Record<string, string>;
  error?: string;
  outcome: Outcome;
}

export class Dispatcher extends EventEmitter {
  private readonly backends = new Map<Language, Backend>();
  private readonly runs = new Map<string, Entry>();
  private readonly queue: Entry[] = [];
  private active = 0;
  /** `<user>:<mode>` -> end time of the last run of that kind. */
  private readonly lastEnd = new Map<string, number>();
  /** `<user>:<mode>` with a run queued or running. */
  private readonly inFlight = new Set<string>();
  /** `<language>:<user>` with any job queued or running, for exclusive backends. */
  private readonly busy = new Set<string>();
  private readonly log: RunnerLog;

  constructor(
    public readonly limits: Limits,
    backends: Backend[] = [],
    log: RunnerLog = silent,
    private readonly now: () => number = Date.now,
  ) {
    super();
    this.setMaxListeners(0);
    this.log = log;
    for (const b of backends) this.register(b);
  }

  register(backend: Backend): void {
    this.backends.set(backend.language, backend);
  }

  backend(language: Language): Backend | undefined {
    return this.backends.get(language);
  }

  // ── cooldown ─────────────────────────────────────────────────────────────

  cooldownFor(mode: RunMode): number {
    return mode === 'test' ? this.limits.cooldownTestSeconds : this.limits.cooldownRunSeconds;
  }

  /** Seconds still to wait before `user` may start a `mode` run; 0 when free. */
  cooldownRemaining(user: string | number, mode: RunMode): number {
    const key = `${String(user)}:${mode}`;
    if (this.inFlight.has(key)) return this.cooldownFor(mode);
    const last = this.lastEnd.get(key);
    if (last === undefined) return 0;
    const left = this.cooldownFor(mode) * 1000 - (this.now() - last);
    return left > 0 ? Math.ceil(left / 1000) : 0;
  }

  /** Clear a user's clocks (tests and verification tools only). */
  clearCooldown(user: string | number): void {
    for (const mode of ['run', 'test'] as const) this.lastEnd.delete(`${String(user)}:${mode}`);
  }

  // ── submit ───────────────────────────────────────────────────────────────

  /**
   * Queue a run. Throws CooldownError, QueueFullError, BusyError or
   * UnknownLanguageError synchronously; otherwise returns the run id at once.
   */
  submitRun(input: SubmitRunInput): string {
    const user = String(input.user);
    const backend = this.requireBackend(input.language);
    const cooling = this.cooldownRemaining(user, input.mode);
    if (cooling > 0) throw new CooldownError(cooling);
    const entry = this.enqueue(backend, {
      id: randomUUID(),
      user,
      language: input.language,
      kind: input.mode,
      slug: input.slug,
      files: input.files,
      args: input.args ?? [],
      exercise: input.exercise ?? {},
    });
    this.inFlight.add(`${user}:${input.mode}`);
    return entry.run.id;
  }

  /** Legacy Rust path: queue an explicit command. Same cooldown and queue as submitRun. */
  submitRaw(input: Omit<SubmitRunInput, 'files'> & { files?: Record<string, string>; cmd: string[]; cwd?: string }): string {
    const user = String(input.user);
    const backend = this.requireBackend(input.language);
    const cooling = this.cooldownRemaining(user, input.mode);
    if (cooling > 0) throw new CooldownError(cooling);
    const entry = this.enqueue(backend, {
      id: randomUUID(),
      user,
      language: input.language,
      kind: input.mode,
      slug: input.slug,
      files: input.files ?? {},
      args: input.args ?? [],
      exercise: input.exercise ?? {},
      raw: { cmd: input.cmd, cwd: input.cwd },
    });
    this.inFlight.add(`${user}:${input.mode}`);
    return entry.run.id;
  }

  /** Format files through the queue (Go gofumpt). No cooldown; the route rate-limits. */
  async submitFormat(input: { user: string | number; language: Language; files: Record<string, string> }): Promise<FormatResult> {
    const backend = this.requireBackend(input.language);
    const entry = this.enqueue(
      backend,
      {
        id: randomUUID(),
        user: String(input.user),
        language: input.language,
        kind: 'format',
        slug: '',
        files: input.files,
        args: [],
        exercise: {},
      },
      FORMAT_TIMEOUT_MS,
    );
    const run = await this.waitFor(entry.run.id);
    const r = run.result;
    if (run.outcome === 'passed' && r?.files) return { ok: true, files: r.files, outcome: 'passed' };
    return { ok: false, error: r?.error || run.output.trim() || 'format failed', outcome: run.outcome ?? 'error' };
  }

  private requireBackend(language: Language): Backend {
    const b = this.backends.get(language);
    if (!b) throw new UnknownLanguageError(language);
    return b;
  }

  private enqueue(backend: Backend, job: Job, timeoutMs = this.limits.timeoutSeconds * 1000): Entry {
    if (this.queue.length >= this.limits.queueMax) throw new QueueFullError(this.queue.length);
    const busyKey = `${job.language}:${job.user}`;
    if (backend.exclusivePerUser) {
      if (this.busy.has(busyKey)) throw new BusyError();
      this.busy.add(busyKey);
    }
    const events = new EventEmitter();
    events.setMaxListeners(0);
    const run: RunRecord = {
      id: job.id,
      user: job.user,
      language: job.language,
      slug: job.slug,
      kind: job.kind,
      state: 'queued',
      queuePosition: 0,
      createdAt: this.now(),
      startedAt: null,
      output: '',
      outputBytes: 0,
      truncated: false,
      outcome: null,
      exitCode: null,
      durationMs: null,
      events,
    };
    const entry: Entry = { run, job, backend, controller: new AbortController(), timeoutMs };
    this.runs.set(run.id, entry);
    this.queue.push(entry);
    this.reindex();
    queueMicrotask(() => this.pump());
    return entry;
  }

  // ── queries ──────────────────────────────────────────────────────────────

  get(id: string): RunRecord | undefined {
    return this.runs.get(id)?.run;
  }

  /** Runs this user has queued or running. */
  activeFor(user: string | number): RunRecord[] {
    const u = String(user);
    return [...this.runs.values()].filter((e) => e.run.user === u && e.run.state !== 'done').map((e) => e.run);
  }

  get activeRuns(): number {
    return this.active;
  }

  get queueDepth(): number {
    return this.queue.length;
  }

  isQueued(user: string | number): boolean {
    const u = String(user);
    return this.queue.some((e) => e.run.user === u);
  }

  isRunning(user: string | number): boolean {
    const u = String(user);
    return [...this.runs.values()].some((e) => e.run.user === u && e.run.state === 'running');
  }

  /** Resolves when the run is done (immediately if it already is). */
  waitFor(id: string): Promise<RunRecord> {
    const entry = this.runs.get(id);
    if (!entry) return Promise.reject(new Error(`unknown run: ${id}`));
    const { run } = entry;
    if (run.state === 'done') return Promise.resolve(run);
    return new Promise((resolve) => {
      const on = (e: RunEvent) => {
        if (e.type !== 'done') return;
        run.events.off('event', on);
        resolve(run);
      };
      run.events.on('event', on);
    });
  }

  /**
   * Subscribe to a run's events, replaying what already happened (current state,
   * output so far, and `done` if finished) so a late WebSocket loses nothing.
   * Returns the unsubscribe function; undefined if the run is unknown.
   */
  subscribe(id: string, listener: (e: RunEvent) => void): (() => void) | undefined {
    const entry = this.runs.get(id);
    if (!entry) return undefined;
    const { run } = entry;
    listener({ type: 'state', state: run.state, queuePosition: run.queuePosition });
    if (run.output) listener({ type: 'output', text: run.output });
    if (run.state === 'done') {
      listener(this.doneEvent(run));
      return () => {};
    }
    run.events.on('event', listener);
    return () => run.events.off('event', listener);
  }

  // ── cancel ───────────────────────────────────────────────────────────────

  /** Cancel one run. `user` must own it. False if unknown, not theirs or already done. */
  cancel(id: string, user: string | number): boolean {
    const entry = this.runs.get(id);
    if (!entry || entry.run.user !== String(user) || entry.run.state === 'done') return false;
    const queuedAt = this.queue.indexOf(entry);
    if (queuedAt >= 0) {
      this.queue.splice(queuedAt, 1);
      this.reindex();
      entry.controller.abort('cancelled');
      this.finish(entry, 'cancelled', null);
      return true;
    }
    entry.controller.abort('cancelled');
    return true;
  }

  /** Cancel every run this user has queued or running. Returns how many. */
  cancelUser(user: string | number): number {
    let n = 0;
    for (const run of this.activeFor(user)) if (this.cancel(run.id, user)) n += 1;
    return n;
  }

  /** Abort everything (shutdown). */
  async stop(): Promise<void> {
    for (const e of [...this.runs.values()]) if (e.run.state !== 'done') this.cancel(e.run.id, e.run.user);
    await Promise.all([...this.backends.values()].map((b) => b.stop?.()));
  }

  // ── execution ────────────────────────────────────────────────────────────

  private reindex(): void {
    this.queue.forEach((e, i) => {
      if (e.run.queuePosition === i + 1) return;
      e.run.queuePosition = i + 1;
      this.emitEvent(e.run, { type: 'state', state: 'queued', queuePosition: i + 1 });
    });
  }

  private pump(): void {
    while (this.active < this.limits.maxConcurrent && this.queue.length > 0) {
      const entry = this.queue.shift()!;
      this.reindex();
      this.active += 1;
      void this.execute(entry).finally(() => {
        this.active -= 1;
        this.pump();
      });
    }
  }

  private async execute(entry: Entry): Promise<void> {
    const { run, job, backend, controller } = entry;
    const { signal } = controller;
    run.state = 'running';
    run.queuePosition = 0;
    run.startedAt = this.now();
    this.emitEvent(run, { type: 'state', state: 'running', queuePosition: 0 });

    const timer = setTimeout(() => controller.abort('timeout'), entry.timeoutMs);

    const ctx = {
      signal,
      output: (text: string): boolean => this.appendOutput(entry, text),
    };

    // A backend that ignores the signal must not hold a slot forever.
    let graceTimer: NodeJS.Timeout | undefined;
    const abandoned = new Promise<'abandoned'>((resolve) => {
      const onAbort = () => {
        graceTimer = setTimeout(() => resolve('abandoned'), ABORT_GRACE_MS);
      };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });

    let result: BackendResult | null = null;
    let failed: unknown = null;
    try {
      const r = await Promise.race([backend.run(job, ctx), abandoned]);
      if (r === 'abandoned') {
        this.log.warn('runner.backend_ignored_abort', { runId: run.id, language: job.language });
      } else {
        result = r;
      }
    } catch (err) {
      failed = err;
    } finally {
      clearTimeout(timer);
      if (graceTimer) clearTimeout(graceTimer);
    }

    const reason = signal.aborted ? (signal.reason as Outcome) : null;
    let outcome: Outcome;
    if (reason && ABORT_OUTCOMES.has(reason)) outcome = reason;
    else if (failed || !result) {
      outcome = 'error';
      if (failed) this.log.error('runner.job_failed', { runId: run.id, language: job.language, kind: job.kind, error: String(failed) });
    } else if (result.oomKilled) outcome = 'oom';
    else if (job.kind === 'format') outcome = result.error || !result.files ? 'failed' : 'passed';
    else if (result.exitCode === null) outcome = 'error';
    else outcome = backend.outcomeFor?.(job.kind, result.exitCode) ?? (result.exitCode === 0 ? 'passed' : 'failed');

    if (result) run.result = result;
    this.finish(entry, outcome, result?.exitCode ?? null);
  }

  private appendOutput(entry: Entry, text: string): boolean {
    const { run } = entry;
    if (run.truncated || run.state === 'done' || !text) return !run.truncated;
    const bytes = Buffer.byteLength(text, 'utf8');
    const room = this.limits.outputLimitBytes - run.outputBytes;
    if (bytes <= room) {
      run.output += text;
      run.outputBytes += bytes;
      this.emitEvent(run, { type: 'output', text });
      return true;
    }
    // Cut on a byte budget, then drop a trailing partial UTF-8 sequence.
    const cut = Buffer.from(text, 'utf8').subarray(0, Math.max(0, room)).toString('utf8').replace(/�$/, '');
    if (cut) {
      run.output += cut;
      run.outputBytes += Buffer.byteLength(cut, 'utf8');
      this.emitEvent(run, { type: 'output', text: cut });
    }
    run.truncated = true;
    entry.controller.abort('output_limit');
    return false;
  }

  private finish(entry: Entry, outcome: Outcome, exitCode: number | null): void {
    const { run, job, backend } = entry;
    if (run.state === 'done') return;
    run.state = 'done';
    run.outcome = outcome;
    run.exitCode = exitCode;
    run.durationMs = run.startedAt === null ? 0 : this.now() - run.startedAt;
    if (job.kind !== 'format') {
      const key = `${job.user}:${job.kind}`;
      this.inFlight.delete(key);
      this.lastEnd.set(key, this.now());
    }
    if (backend.exclusivePerUser) this.busy.delete(`${job.language}:${job.user}`);
    this.log.info('runner.done', {
      runId: run.id,
      language: job.language,
      kind: job.kind,
      slug: job.slug,
      outcome,
      exitCode,
      ms: run.durationMs,
    });
    this.emitEvent(run, this.doneEvent(run));
    this.emit('done', run);
    const t = setTimeout(() => this.runs.delete(run.id), this.limits.retainDoneMs);
    t.unref?.();
  }

  private doneEvent(run: RunRecord): RunEvent {
    return {
      type: 'done',
      outcome: run.outcome ?? 'error',
      exitCode: run.exitCode,
      durationMs: run.durationMs ?? 0,
      truncated: run.truncated,
    };
  }

  private emitEvent(run: RunRecord, event: RunEvent): void {
    run.events.emit('event', event);
  }
}

