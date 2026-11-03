/**
 * The Rust reference's `runner` object, kept so the reference routes, the
 * terminal and main.ts keep working while the language-prefixed routes move to
 * submitRun(). Everything goes through the shared dispatcher: same queue, same
 * cooldown clocks, same limits.
 */

import type { Dispatcher } from './dispatcher.js';
import type { RustBackend } from './rust.js';
import { runnerLimits } from './settings.js';
import { CooldownError, type RunMode } from './types.js';

export type RunKind = RunMode;

export interface ExecResult {
  exitCode: number;
  output: string;
  durationMs: number;
  truncated: boolean;
  cancelled: boolean;
  oomKilled: boolean;
}

/** The run outlived the timeout and was killed. */
export class RunTimeoutError extends Error {
  constructor(public readonly seconds: number) {
    super(`run exceeded ${seconds}s`);
    this.name = 'RunTimeoutError';
  }
}

export { CooldownError };

export class LegacyRustRunner {
  constructor(
    private readonly dispatcher: Dispatcher,
    private readonly rust: RustBackend,
    private readonly preflightAll: () => Promise<void>,
  ) {}

  static cooldownFor(kind: RunKind): number {
    return kind === 'test' ? runnerLimits.cooldownTestSeconds : runnerLimits.cooldownRunSeconds;
  }

  preflight(): Promise<void> {
    return this.preflightAll();
  }

  start(): void {
    this.rust.start();
  }

  stop(): Promise<void> {
    return this.dispatcher.stop();
  }

  cooldownRemaining(userId: string, kind: RunKind): number {
    return this.dispatcher.cooldownRemaining(userId, kind);
  }

  clearCooldown(userId: string): void {
    this.dispatcher.clearCooldown(userId);
  }

  get queueDepth(): number {
    return this.dispatcher.queueDepth;
  }

  get activeRuns(): number {
    return this.dispatcher.activeRuns;
  }

  ensureContainer(userId: string): Promise<string> {
    return this.rust.ensureContainer(userId);
  }

  release(userId: string): Promise<void> {
    return this.rust.release(userId);
  }

  attachTerminal(userId: string): void {
    this.rust.attachTerminal(userId);
  }

  detachTerminal(userId: string): void {
    this.rust.detachTerminal(userId);
  }

  touch(userId: string): void {
    this.rust.touch(userId);
  }

  writeFiles(userId: string, files: { path: string; content: string }[]): Promise<void> {
    return this.rust.writeFiles(userId, files);
  }

  /** Run a command in the user's Rust container through the dispatcher; blocks until done. */
  async exec(userId: string, cmd: string[], opts: { cwd?: string; kind?: RunKind } = {}): Promise<ExecResult> {
    const kind = opts.kind ?? 'run';
    const id = this.dispatcher.submitRaw({ user: userId, language: 'rust', slug: '', mode: kind, cmd, cwd: opts.cwd });
    const run = await this.dispatcher.waitFor(id);
    if (run.outcome === 'timeout') throw new RunTimeoutError(runnerLimits.timeoutSeconds);
    if (run.outcome === 'error' && run.exitCode === null) throw new Error('runner failed');
    return {
      exitCode: run.exitCode ?? -1,
      output: run.output,
      durationMs: run.durationMs ?? 0,
      truncated: run.truncated,
      cancelled: run.outcome === 'cancelled',
      oomKilled: run.outcome === 'oom',
    };
  }

  isRunning(userId: string): boolean {
    return this.dispatcher.isRunning(userId);
  }

  isQueued(userId: string): boolean {
    return this.dispatcher.isQueued(userId);
  }

  /** Cancel everything this user has in flight. */
  async cancel(userId: string): Promise<boolean> {
    return this.dispatcher.cancelUser(userId) > 0;
  }
}
