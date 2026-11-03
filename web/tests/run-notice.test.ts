/**
 * Run-notice tests.
 *
 * These outcomes are exactly the ones the output cannot explain: a program
 * killed at the time limit and one killed for flooding stdout both simply
 * stop. If the wording regresses, the student is left with a truncated log and
 * no idea which happened — so the wording is pinned.
 */

import { describe, expect, test } from 'vitest';
import { noticeFor } from '../src/components/RunNotice.js';

describe('noticeFor', () => {
  test('a clean run says nothing', () => {
    expect(noticeFor('ok')).toBeNull();
    expect(noticeFor(undefined)).toBeNull();
  });

  test('a timeout names the limit and points at loops', () => {
    const n = noticeFor('timeout', { timeoutSeconds: 120 });
    expect(n?.tone).toBe('warn');
    expect(n?.title).toContain('120 seconds');
    expect(n?.title).toMatch(/stopped/i);
    // The actionable half: a warning that only reports the symptom leaves the
    // student exactly as stuck as before.
    expect(n?.detail).toMatch(/loop/i);
  });

  test('the timeout message uses the server’s limit, not a hardcoded one', () => {
    expect(noticeFor('timeout', { timeoutSeconds: 30 })?.title).toContain('30 seconds');
  });

  test('a capped output says it was cut off', () => {
    const n = noticeFor('output_limit');
    expect(n?.tone).toBe('warn');
    expect(n?.title).toMatch(/cut off/i);
  });

  test('an OOM kill blames memory, not the platform', () => {
    const n = noticeFor('out_of_memory');
    expect(n?.title).toMatch(/out of memory/i);
    expect(n?.detail).toMatch(/growing|recursion/i);
  });

  test('a cancelled run is informational, not a warning', () => {
    const n = noticeFor('cancelled');
    expect(n?.tone).toBe('info');
    expect(n?.title).toMatch(/cancelled/i);
  });

  test('dropped arguments are reported even on an otherwise clean run', () => {
    const n = noticeFor('ok', { argsTruncated: true, maxArgs: 16 });
    expect(n?.tone).toBe('warn');
    expect(n?.title).toContain('16');
  });

  test('a real outcome takes precedence over the argument warning', () => {
    // Being told about arguments while the program is stuck in a loop is noise.
    expect(noticeFor('timeout', { argsTruncated: true })?.title).toMatch(/more than .* seconds/);
  });

  test('a runner failure is owned, not blamed on the student', () => {
    const n = noticeFor('runner_error');
    expect(n?.tone).toBe('error');
    expect(n?.title).toMatch(/our side/i);
    expect(n?.title).toMatch(/not in your code/i);
  });

  test('a Run that prints nothing explains why', () => {
    const n = noticeFor('ok', { emptyOutput: true, kind: 'run' });
    expect(n?.tone).toBe('info');
    expect(n?.title).toMatch(/printed nothing/i);
    expect(n?.detail).toMatch(/main\.rs/);
  });

  test('Submit printing nothing is not remarked on', () => {
    // cargo test is expected to be quiet when everything passes.
    expect(noticeFor('ok', { emptyOutput: true, kind: 'test' })).toBeNull();
  });

  test('the timeout message reflects the configured limit of 60s', () => {
    expect(noticeFor('timeout', { timeoutSeconds: 60 })?.title).toContain('60 seconds');
  });

  test('no message blames the student or the platform', () => {
    const outcomes = ['timeout', 'output_limit', 'out_of_memory', 'cancelled'] as const;
    // runner_error is excluded deliberately: that one SHOULD say it is ours.
    for (const o of outcomes) {
      const n = noticeFor(o);
      const text = `${n?.title ?? ''} ${n?.detail ?? ''}`;
      expect(text).not.toMatch(/unavailable|busy|our fault|error on our side/i);
    }
  });
});
