/** Labels and formatting shared by the dashboard, history and workbench. */
import type { Language } from './api.js';

export const LANGUAGE_LABEL: Record<Language, string> = { go: 'Go', js: 'JavaScript', rust: 'Rust' };

const OUTCOME_LABEL: Record<string, string> = {
  passed: 'Passed',
  failed: 'Failed',
  unformatted: 'Not formatted',
  forbidden: 'Forbidden import',
  build_error: 'Build error',
  missing_file: 'Missing file',
  timeout: 'Timed out',
  output_limit: 'Output too long',
  oom: 'Out of memory',
  cancelled: 'Cancelled',
  error: 'Error',
};

/** Outcomes a student can filter history by, in display order. */
export const OUTCOMES = Object.keys(OUTCOME_LABEL);

export function outcomeLabel(outcome: string | null, kind: string): string {
  if (!outcome) return kind === 'run' ? 'Ran' : 'Finished';
  return OUTCOME_LABEL[outcome] ?? outcome;
}

export function outcomeColor(outcome: string | null): string {
  if (outcome === 'passed') return 'var(--success)';
  if (!outcome || outcome === 'cancelled') return 'var(--text-muted)';
  if (outcome === 'failed') return 'var(--danger)';
  return 'var(--warning)';
}

export function kindLabel(kind: string): string {
  return kind === 'test' ? 'Submit' : 'Run';
}

/** "3 minutes ago", "2 days ago", then a date. */
export function ago(iso: string): string {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 14) return `${d} day${d === 1 ? '' : 's'} ago`;
  return new Date(t).toLocaleDateString();
}

/** Remaining time as h:mm:ss. */
export function fmtCountdown(ms: number): string {
  const t = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = t % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
