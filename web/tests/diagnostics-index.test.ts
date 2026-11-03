import { describe, expect, test } from 'vitest';
import { canonicalOutcome, diagnoseRun, noticeOutcome } from '../src/lib/diagnostics/index.js';

describe('canonical outcomes across runners', () => {
  test('Rust words, Go/JS words and a bare exit code agree', () => {
    expect(canonicalOutcome('ok', 0)).toBe('passed');
    expect(canonicalOutcome('ok', 101)).toBe('failed');
    expect(canonicalOutcome('out_of_memory', null)).toBe('oom');
    expect(canonicalOutcome('runner_error', null)).toBe('error');
    expect(canonicalOutcome('unformatted', 1)).toBe('unformatted');
    expect(canonicalOutcome(undefined, 0)).toBe('passed');
    expect(noticeOutcome('oom')).toBe('out_of_memory');
  });
});

describe('dispatch per language', () => {
  test('Go unformatted offers Format', () => {
    const d = diagnoseRun('go', 'test', { outcome: 'unformatted', output: '' });
    expect(d.canFormat).toBe(true);
  });
  test('JS reads its own errors', () => {
    const d = diagnoseRun('js', 'test', { outcome: 'failed', output: 'ReferenceError: foo is not defined' });
    expect(d.title).toContain('foo');
  });
  test('Rust passes on exit 0 for Submit', () => {
    expect(diagnoseRun('rust', 'test', { outcome: 'ok', exitCode: 0, output: 'test result: ok. 1 passed; 0 failed;' }).tone).toBe('ok');
  });
  test('a cancelled run is the same everywhere', () => {
    for (const l of ['go', 'js', 'rust'] as const) expect(diagnoseRun(l, 'run', { outcome: 'cancelled', output: '' }).title).toBe('Cancelled');
  });
});
