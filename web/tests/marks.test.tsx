/**
 * V4 weighted marks (D35): percent only, never XP. The ring wraps a second lap
 * above 100%, and the exam result names a removed checkpoint instead of 0%.
 */
import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkRing, fmtPercent } from '../src/components/MarkRing.js';
import { ExamResult } from '../src/components/Exams.js';
import type { ExamView } from '../src/lib/api.js';

const exam = (over: Partial<ExamView> = {}): ExamView => ({
  id: 1, language: 'java', checkpoint: '1', minutes: 180,
  startedAt: '2026-11-04T10:00:00Z', endsAt: '2026-11-04T13:00:00Z', endedAt: '2026-11-04T11:00:00Z',
  status: 'finished', passed: 2, total: 5, mark: 150, maxMark: 150, marked: true,
  items: [
    { level: 1, slug: 'goodbye-mars', title: 'Goodbye Mars', value: 10, submits: 1, passed: true, passedAt: null },
    { level: 5, slug: 'factorial', title: 'Factorial', value: 50, submits: 2, passed: false, passedAt: null },
  ],
  ...over,
});

describe('percent format', () => {
  test('whole numbers bare, others one decimal', () => {
    expect(fmtPercent(20)).toBe('20%');
    expect(fmtPercent(9.5)).toBe('9.5%');
    expect(fmtPercent(33.33)).toBe('33.3%');
  });
});

describe('MarkRing', () => {
  const arcs = (value: number) =>
    (renderToStaticMarkup(<MarkRing id="t" label="x" caption="c" rings={[{ value, from: 'red', to: 'blue' }]} />).match(/stroke-dasharray="/g) ?? []).length;
  test('no arc at 0%, one up to 100%, a second lap above', () => {
    expect(arcs(0)).toBe(0);
    expect(arcs(60)).toBe(1);
    expect(arcs(100)).toBe(1);
    expect(arcs(160)).toBe(2);
  });
  test('a ring with no second lap leaves no stray "0" in the SVG', () => {
    expect(renderToStaticMarkup(<MarkRing id="t" label="x" caption="c" rings={[{ value: 50, from: 'red', to: 'blue' }]} />)).not.toMatch(/>0</);
  });
});

describe('ExamResult', () => {
  const html = (e: ExamView) => renderToStaticMarkup(<ExamResult exam={e} onClose={() => {}} onDashboard={() => {}} />);
  test('shows the mark, the values and the optional note, never XP', () => {
    const h = html(exam());
    expect(h).toContain('150%');
    expect(h).toContain('10%');
    expect(h).toContain('optional level counts on top');
    expect(h).not.toMatch(/xp/i);
  });
  test('no note at or under 100%', () => {
    expect(html(exam({ mark: 60 }))).not.toContain('optional level counts on top');
  });
  test('a removed checkpoint shows no mark', () => {
    const h = html(exam({ marked: false, mark: 0 }));
    expect(h).toContain('—');
    expect(h).not.toContain('>0%<');
  });
});
