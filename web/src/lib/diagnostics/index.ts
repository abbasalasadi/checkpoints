/**
 * One entry point for every language's diagnostics.
 *
 * Each reference app had its own wording, pinned by its own tests, and those
 * sentences are kept verbatim in rust.ts, go.ts and js.ts. This file only
 * normalises the run result each one expects and the tone each one returns.
 */
import type { Language, RunOutcome } from '../api.js';
import { diagnose as diagnoseRust } from './rust.js';
import { diagnose as diagnoseGo, type Outcome as GoOutcome } from './go.js';
import { diagnose as diagnoseJs, type Outcome as JsOutcome } from './js.js';

export type Tone = 'ok' | 'error' | 'warn' | 'info';

export interface Diagnosis {
  title: string;
  hint?: string;
  tone: Tone;
  /** Go only: the outcome is fixed by pressing Format. */
  canFormat: boolean;
}

export interface RunLimits {
  timeoutSeconds?: number;
  outputLimitBytes?: number;
  memoryMb?: number;
}

/** The canonical outcome, whatever spelling the runner used. */
export type Canonical =
  | 'passed' | 'failed' | 'cancelled' | 'timeout' | 'output_limit' | 'oom' | 'error'
  | 'unformatted' | 'forbidden' | 'build_error' | 'missing_file';

const KNOWN = new Set<Canonical>([
  'passed', 'failed', 'cancelled', 'timeout', 'output_limit', 'oom', 'error',
  'unformatted', 'forbidden', 'build_error', 'missing_file',
]);

export function canonicalOutcome(outcome: string | undefined | null, exitCode: number | null | undefined): Canonical {
  if (outcome === 'out_of_memory' || outcome === 'oom') return 'oom';
  if (outcome === 'runner_error' || outcome === 'error') return 'error';
  if (outcome && outcome !== 'ok' && KNOWN.has(outcome as Canonical)) return outcome as Canonical;
  return exitCode === 0 ? 'passed' : 'failed';
}

/** The Rust reference's outcome vocabulary, which RunNotice speaks. */
export function noticeOutcome(c: Canonical): RunOutcome {
  switch (c) {
    case 'timeout': return 'timeout';
    case 'output_limit': return 'output_limit';
    case 'oom': return 'out_of_memory';
    case 'cancelled': return 'cancelled';
    case 'error': return 'runner_error';
    default: return 'ok';
  }
}

const STOPPED: Partial<Record<Canonical, Diagnosis>> = {
  cancelled: { title: 'Cancelled', tone: 'info', canFormat: false },
  timeout: { title: 'Timed out', tone: 'warn', canFormat: false },
  output_limit: { title: 'Printed too much', tone: 'warn', canFormat: false },
  oom: { title: 'Out of memory', tone: 'warn', canFormat: false },
  error: { title: 'Could not run', tone: 'warn', canFormat: false },
};

export function diagnoseRun(
  language: Language,
  kind: 'run' | 'test',
  result: { outcome?: string | null; exitCode?: number | null; output: string; limits?: RunLimits },
): Diagnosis {
  const c = canonicalOutcome(result.outcome, result.exitCode);
  const limits = result.limits ?? {};

  if (language === 'rust') {
    // The stopped outcomes are explained by RunNotice; the Rust index reads cargo output.
    const stopped = STOPPED[c];
    if (stopped) return stopped;
    const d = diagnoseRust(kind, result.exitCode ?? (c === 'passed' ? 0 : 1), result.output);
    return { title: d.title, hint: d.hint, tone: d.tone, canFormat: false };
  }

  if (language === 'go') {
    if (c === 'cancelled') return STOPPED.cancelled!;
    const d = diagnoseGo(
      c as GoOutcome,
      result.output,
      {
        timeoutSeconds: limits.timeoutSeconds,
        memoryMb: limits.memoryMb,
        outputLimitKb: limits.outputLimitBytes ? Math.round(limits.outputLimitBytes / 1024) : undefined,
      },
      kind === 'test' ? 'submit' : 'run',
      true,
    );
    const tone: Tone = d.tone === 'good' ? 'ok' : d.tone === 'bad' ? 'error' : d.tone;
    return { title: d.title, hint: d.hint ?? undefined, tone, canFormat: d.canFormat };
  }

  const jsOutcome: JsOutcome = (['passed', 'cancelled', 'timeout', 'output_limit', 'oom', 'error'] as const).includes(
    c as never,
  )
    ? (c as JsOutcome)
    : 'failed';
  const d = diagnoseJs(kind === 'test' ? 'submit' : 'run', jsOutcome, result.output, {
    timeoutSeconds: limits.timeoutSeconds,
    outputLimitBytes: limits.outputLimitBytes,
  });
  return { title: d.title, hint: d.hint, tone: d.tone, canFormat: false };
}
