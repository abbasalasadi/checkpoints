/**
 * The inline notice above the results pane.
 *
 * Some run outcomes cannot be read off the output: a program killed at 120
 * seconds and one killed for printing a gigabyte both just stop, and the
 * student is left staring at a truncated log with no idea which happened.
 *
 * Deliberately NOT a modal. These fire on ordinary mistakes and would appear
 * often; a popup shown that often becomes something you dismiss reflexively
 * without reading, which is worse than no warning at all. It sits with the
 * output it describes and stays until the next run replaces it.
 *
 * Every message names what happened, then what to check — a warning that only
 * reports a symptom leaves the student exactly as stuck as before.
 */
import type { RunOutcome } from '../lib/api.js';

export interface NoticeSpec {
  tone: 'warn' | 'info' | 'error';
  title: string;
  detail?: string;
}

/** The notice for a finished run, or null when there is nothing to say. */
export function noticeFor(
  outcome: RunOutcome | undefined,
  opts: {
    timeoutSeconds?: number;
    argsTruncated?: boolean;
    maxArgs?: number;
    /** The run finished cleanly but printed nothing. */
    emptyOutput?: boolean;
    kind?: 'run' | 'test';
  } = {},
): NoticeSpec | null {
  switch (outcome) {
    case 'timeout':
      return {
        tone: 'warn',
        title: `Your program ran for more than ${opts.timeoutSeconds ?? 120} seconds and was stopped.`,
        detail: 'This usually means a loop that never ends — check your loop, while, and any recursion.',
      };
    case 'output_limit':
      return {
        tone: 'warn',
        title: 'Output was too large, so it was cut off here.',
        detail: 'This usually means printing inside a loop that never ends.',
      };
    case 'out_of_memory':
      return {
        tone: 'warn',
        title: 'Your program ran out of memory and was stopped.',
        detail: 'Check for a collection that keeps growing, or a recursion with no base case.',
      };
    case 'cancelled':
      return { tone: 'info', title: 'Run cancelled.', detail: 'You stopped this run.' };
    case 'runner_error':
      return {
        tone: 'error',
        title: 'Something went wrong on our side, not in your code.',
        detail: 'Please try again in a moment.',
      };
    default:
      // A normal run still warns if arguments were dropped, since silently
      // ignoring input the student typed is its own kind of wrong answer.
      if (opts.argsTruncated) {
        return {
          tone: 'warn',
          title: `Only the first ${opts.maxArgs ?? 16} arguments were used.`,
          detail: 'The rest were ignored.',
        };
      }
      // A Run that prints nothing is the commonest confusion: the graded file
      // only defines a function, so with nothing calling it there is nothing to
      // see. An empty pane looks broken; saying so costs one line.
      if (opts.emptyOutput && opts.kind === 'run') {
        return {
          tone: 'info',
          title: 'Finished, but printed nothing.',
          detail: 'main.rs is what Run executes — call your function there, or add a println!.',
        };
      }
      return null;
  }
}

const TONES = {
  warn: { fg: 'var(--warning)', bg: 'rgba(224, 163, 58, .08)' },
  error: { fg: 'var(--danger)', bg: 'rgba(240, 115, 106, .08)' },
  info: { fg: 'var(--text-muted)', bg: 'var(--surface)' },
} as const;

export function RunNotice({ notice }: { notice: NoticeSpec | null }) {
  if (!notice) return null;
  const tone = TONES[notice.tone];
  return (
    <div
      // polite, not assertive: it accompanies a result the student just asked
      // for, so it should not interrupt what a screen reader is already saying.
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        gap: '.5rem',
        padding: '.5rem .7rem',
        borderTop: '1px solid var(--border)',
        borderLeft: `3px solid ${tone.fg}`,
        background: tone.bg,
        fontSize: '.8rem',
        lineHeight: 1.5,
        flex: '0 0 auto',
      }}
    >
      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{notice.title}</span>
      {notice.detail && <span style={{ color: 'var(--text-muted)' }}>{notice.detail}</span>}
    </div>
  );
}
