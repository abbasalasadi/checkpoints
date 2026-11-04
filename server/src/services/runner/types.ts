/**
 * Shared shapes for the run dispatcher and its backends.
 *
 * Nothing in here imports the app (config, logger, DB), so the dispatcher can be
 * unit-tested with a fake backend and no side effects.
 */

import type { EventEmitter } from 'node:events';

/** Mirrors `Language` in server/src/languages.ts (V1 contract). Kept local so this module has no app imports. */
export type Language = 'go' | 'js' | 'rust' | 'java';

/** What the student pressed. `test` is the graded submit (cooldown 90 s); `run` executes (30 s). */
export type RunMode = 'run' | 'test';

/** Internal job kind. `format` (Go gofumpt) shares the queue but has no cooldown. */
export type JobKind = RunMode | 'format';

export type RunState = 'queued' | 'running' | 'done';

/**
 * One verdict vocabulary for all three languages.
 *
 *   passed / failed                     exit code 0 / non-zero
 *   unformatted / forbidden /           Go entrypoint exit codes 10 / 11 / 12 / 13
 *   build_error / missing_file          (test mode only)
 *   timeout / output_limit / oom /      decided by the dispatcher or Docker,
 *   cancelled / error                   never by the program itself
 */
export type Outcome =
  | 'passed'
  | 'failed'
  | 'unformatted'
  | 'forbidden'
  | 'build_error'
  | 'missing_file'
  | 'timeout'
  | 'output_limit'
  | 'oom'
  | 'cancelled'
  | 'error';

/** Exercise facts the Go and JS entrypoints need. Rust ignores it. */
export interface ExerciseMeta {
  /** Graded files (Go: first is FILE for `rc`; JS: comma-joined into FILE). */
  expectedFiles?: string[];
  /** Files the editor shows; run mode concatenates / runs these. */
  editorFiles?: string[];
  /** Go only: functions `rc` allows. */
  allowedFunctions?: string[];
  /** Java only: the official test class (EXERCISE for the entrypoint), e.g. AlmostPalindrome. */
  className?: string;
}

export interface SubmitRunInput {
  /** User id (number or string); cooldowns and ownership key on String(user). */
  user: string | number;
  language: Language;
  slug: string;
  /** Path -> content. Rust: the materialised workspace (relative to /workspace). Go/JS: the student files. */
  files: Record<string, string>;
  args?: string[];
  mode: RunMode;
  exercise?: ExerciseMeta;
}

export interface Job {
  id: string;
  user: string;
  language: Language;
  kind: JobKind;
  slug: string;
  files: Record<string, string>;
  args: string[];
  exercise: ExerciseMeta;
  /** Rust legacy path only: an explicit argv + cwd instead of the cargo command derived from slug/mode. */
  raw?: { cmd: string[]; cwd?: string };
}

export interface JobContext {
  /** Aborted on cancel, timeout or output cap. `signal.reason` is the Outcome that caused it. */
  signal: AbortSignal;
  /** Forward program output. Returns false once the output cap is reached (the job is then aborted). */
  output(text: string): boolean;
}

export interface BackendResult {
  exitCode: number | null;
  oomKilled?: boolean;
  /** Format jobs only: the rewritten files. */
  files?: Record<string, string>;
  /** Format jobs only: a parse error to show instead of files. */
  error?: string;
}

export interface Backend {
  readonly language: Language;
  /** Rust: one job per user at a time, because jobs share the user's warm container workspace. */
  readonly exclusivePerUser?: boolean;
  /** Map an exit code to a verdict when nothing else (cancel/timeout/cap/oom) decided it. */
  outcomeFor?(kind: JobKind, exitCode: number): Outcome;
  run(job: Job, ctx: JobContext): Promise<BackendResult>;
  preflight?(): Promise<void>;
  start?(): void;
  stop?(): Promise<void>;
}

/** Streamed to the WebSocket verbatim: `JSON.stringify(event)`. */
export type RunEvent =
  | { type: 'state'; state: RunState; queuePosition: number }
  | { type: 'output'; text: string }
  | {
      type: 'done';
      outcome: Outcome;
      exitCode: number | null;
      durationMs: number;
      truncated: boolean;
    };

export interface RunRecord {
  id: string;
  user: string;
  language: Language;
  slug: string;
  kind: JobKind;
  state: RunState;
  /** 1-based while queued, 0 once running. */
  queuePosition: number;
  createdAt: number;
  startedAt: number | null;
  output: string;
  outputBytes: number;
  truncated: boolean;
  outcome: Outcome | null;
  exitCode: number | null;
  durationMs: number | null;
  /** Format jobs only. */
  result?: BackendResult;
  /** Emits 'event' with a RunEvent. */
  events: EventEmitter;
}

export interface Limits {
  maxConcurrent: number;
  cooldownRunSeconds: number;
  cooldownTestSeconds: number;
  timeoutSeconds: number;
  outputLimitBytes: number;
  /** Queued jobs beyond this are refused (QueueFullError). */
  queueMax: number;
  /** How long a finished run stays addressable for a late WebSocket. */
  retainDoneMs: number;
}

export interface RunnerLog {
  info(op: string, ctx?: Record<string, unknown>): void;
  warn(op: string, ctx?: Record<string, unknown>): void;
  error(op: string, ctx?: Record<string, unknown>): void;
}

export class CooldownError extends Error {
  constructor(public readonly secondsRemaining: number) {
    super(`cooling down, ${secondsRemaining}s remaining`);
    this.name = 'CooldownError';
  }
}

export class QueueFullError extends Error {
  constructor(public readonly depth: number) {
    super(`queue full (${depth})`);
    this.name = 'QueueFullError';
  }
}

/** The user already has a job in flight on a backend that allows only one (Rust). */
export class BusyError extends Error {
  constructor() {
    super('a run is already in progress');
    this.name = 'BusyError';
  }
}

export class UnknownLanguageError extends Error {
  constructor(language: string) {
    super(`no runner backend for language: ${language}`);
    this.name = 'UnknownLanguageError';
  }
}
