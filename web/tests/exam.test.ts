/**
 * Mock exam helpers (V3): the countdown never shows a negative time, and the
 * report's "took" figure runs to the end, or to now while the exam is open.
 */
import { describe, expect, test } from 'vitest';
import { fmtCountdown } from '../src/lib/format.js';
import { examSpent } from '../src/components/Exams.js';
import type { ExamView } from '../src/lib/api.js';

describe('exam countdown', () => {
  test('formats h:mm:ss and stops at zero', () => {
    expect(fmtCountdown(180 * 60_000)).toBe('3:00:00');
    expect(fmtCountdown(61_500)).toBe('0:01:02');
    expect(fmtCountdown(-5000)).toBe('0:00:00');
  });

  test('time spent runs to the end of a closed exam', () => {
    const e = { startedAt: '2026-11-04T10:00:00Z', endedAt: '2026-11-04T11:30:00Z' } as ExamView;
    expect(examSpent(e)).toBe(90 * 60_000);
  });
});
