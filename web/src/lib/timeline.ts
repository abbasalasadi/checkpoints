/**
 * History by exercise (D26): fold the runs between two submits into one line,
 * so a timeline reads as its milestones, and a small line diff for comparing
 * two submits.
 */
import type { AttemptSummary, ExerciseHistory } from './api.js';
import { outcomeLabel } from './format.js';

export type TimelineItem =
  | { type: 'runs'; attempts: AttemptSummary[] }
  | { type: 'submit'; attempt: AttemptSummary; n: number; previous: AttemptSummary | null };

/** Oldest first in, oldest first out. */
export function groupTimeline(attempts: AttemptSummary[]): TimelineItem[] {
  const out: TimelineItem[] = [];
  let runs: AttemptSummary[] = [];
  let n = 0;
  let previous: AttemptSummary | null = null;
  for (const a of attempts) {
    if (a.kind === 'run') {
      runs.push(a);
      continue;
    }
    if (runs.length) out.push({ type: 'runs', attempts: runs });
    runs = [];
    n += 1;
    out.push({ type: 'submit', attempt: a, n, previous });
    previous = a;
  }
  if (runs.length) out.push({ type: 'runs', attempts: runs });
  return out;
}

/** What a run's outcome means to a student: a run is not graded. */
export function runLabel(outcome: string | null): string {
  if (outcome === 'passed' || outcome === null) return 'ran ok';
  if (outcome === 'failed') return 'exited with error';
  return outcomeLabel(outcome, 'run').toLowerCase();
}

/** "build error ×3 → ran ok ×2": consecutive equal results collapsed. */
export function summariseRuns(runs: AttemptSummary[]): string {
  const parts: { label: string; n: number }[] = [];
  for (const r of runs) {
    const label = runLabel(r.outcome);
    const last = parts[parts.length - 1];
    if (last && last.label === label) last.n += 1;
    else parts.push({ label, n: 1 });
  }
  return parts.map((p) => (p.n > 1 ? `${p.label} ×${p.n}` : p.label)).join(' → ');
}

/** "25 min", "1 h 5 min", "40 s". */
export function fmtSpent(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`;
}

export type DiffLine = { op: ' ' | '-' | '+'; text: string };

/** Line diff by longest common subsequence; inputs are capped so it stays cheap. */
export function lineDiff(before: string, after: string, maxLines = 1500): DiffLine[] {
  const a = before.split('\n').slice(0, maxLines);
  const b = after.split('\n').slice(0, maxLines);
  const m = a.length;
  const n = b.length;
  const dp: Uint32Array[] = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i]![j] = a[i] === b[j] ? dp[i + 1]![j + 1]! + 1 : Math.max(dp[i + 1]![j]!, dp[i]![j + 1]!);
    }
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      out.push({ op: ' ', text: a[i]! });
      i++;
      j++;
    } else if (dp[i + 1]![j]! >= dp[i]![j + 1]!) out.push({ op: '-', text: a[i++]! });
    else out.push({ op: '+', text: b[j++]! });
  }
  while (i < m) out.push({ op: '-', text: a[i++]! });
  while (j < n) out.push({ op: '+', text: b[j++]! });
  return out;
}

/** "✓ Passed on submit 3", "✗ Not passed yet", "Not submitted yet". */
export function resultText(e: ExerciseHistory): string {
  if (e.passedOnSubmit) return `✓ Passed on submit ${e.passedOnSubmit}`;
  if (e.passed) return '✓ Passed';
  return e.submits ? '✗ Not passed yet' : 'Not submitted yet';
}
