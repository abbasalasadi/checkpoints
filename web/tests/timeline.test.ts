import { describe, expect, test } from 'vitest';
import type { AttemptSummary } from '../src/lib/api.js';
import { fmtSpent, groupTimeline, lineDiff, summariseRuns } from '../src/lib/timeline.js';

let id = 0;
const at = (kind: 'run' | 'test', outcome: string | null): AttemptSummary => ({
  id: ++id, language: 'go', slug: 'gcd', title: 'gcd', kind, outcome, durationMs: 10, at: '2026-11-04T10:00:00Z',
});

describe('history timeline (D26)', () => {
  test('runs between submits fold into one item; submits are numbered and linked', () => {
    const items = groupTimeline([at('run', 'build_error'), at('run', 'passed'), at('test', 'failed'), at('test', 'passed'), at('run', 'passed')]);
    expect(items.map((i) => i.type)).toEqual(['runs', 'submit', 'submit', 'runs']);
    const [, s1, s2] = items;
    expect(s1!.type === 'submit' && s1.n).toBe(1);
    expect(s2!.type === 'submit' && s2.previous?.id).toBe(s1!.type === 'submit' ? s1.attempt.id : -1);
  });

  test('run summary collapses repeats', () => {
    expect(summariseRuns([at('run', 'build_error'), at('run', 'build_error'), at('run', 'passed')])).toBe('build error ×2 → ran ok');
  });

  test('time spent reads naturally', () => {
    expect(fmtSpent(40_000)).toBe('40 s');
    expect(fmtSpent(25 * 60_000)).toBe('25 min');
    expect(fmtSpent(65 * 60_000)).toBe('1 h 5 min');
  });

  test('line diff marks removed and added lines', () => {
    expect(lineDiff('a\nb\nc', 'a\nx\nc')).toEqual([
      { op: ' ', text: 'a' },
      { op: '-', text: 'b' },
      { op: '+', text: 'x' },
      { op: ' ', text: 'c' },
    ]);
  });
});
