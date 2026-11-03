/**
 * Diagnostics tests. Every fixture is real cargo output, so a change to the
 * message index is checked against what students actually see rather than
 * against text invented to match the rule.
 */

import { describe, expect, test } from 'vitest';
import { diagnose } from '../src/lib/diagnostics.js';

describe('success', () => {
  test('a passing test run', () => {
    expect(diagnose('test', 0, 'test result: ok. 1 passed; 0 failed;')).toMatchObject({
      title: 'Passed',
      tone: 'ok',
    });
  });

  test('a clean run does not claim the output is correct', () => {
    // Exit 0 from Run means it compiled and did not panic. Nothing checked the
    // output, so the label must not read like a pass — only Submit verifies.
    const d = diagnose('run', 0, 'Matrix((3, 9), (12, 15))');
    expect(d.tone).toBe('ok');
    expect(d.title).toBe('Compiled');
    expect(d.title).not.toMatch(/success|passed|correct/i);
    expect(d.hint).toMatch(/Submit/);
  });

  test('only Submit reports a pass', () => {
    expect(diagnose('test', 0, 'test result: ok.').title).toBe('Passed');
  });
});

describe('the starting stub', () => {
  test('todo!() is named as the stub, not as a mysterious panic', () => {
    const out = `thread 'main' (7) panicked at src/lib.rs:5:5:\nnot yet implemented`;
    const d = diagnose('run', 101, out);
    expect(d.title).toBe('Not implemented yet');
    expect(d.hint).toMatch(/todo!\(\)/);
  });
});

describe('panics', () => {
  test('index out of bounds quotes the actual numbers', () => {
    const out = `thread 'main' panicked at src/lib.rs:3:9:\nindex out of bounds: the len is 3 but the index is 7`;
    const d = diagnose('run', 101, out);
    expect(d.title).toBe('Panicked: index out of bounds');
    expect(d.hint).toContain('position 7');
    expect(d.hint).toContain('3 long');
  });

  test('unwrap on None', () => {
    const out = 'panicked at src/lib.rs:9:14:\ncalled `Option::unwrap()` on a `None` value';
    expect(diagnose('test', 101, out).title).toBe('Panicked: unwrapped a None');
  });

  test('arithmetic overflow names the operation', () => {
    const out = "thread 'main' panicked at src/lib.rs:4:5:\nattempt to multiply with overflow";
    expect(diagnose('run', 101, out).title).toBe('Panicked: multiply overflowed');
  });

  test('stack overflow is attributed to recursion', () => {
    const d = diagnose('run', 101, "\nthread 'main' has overflowed its stack\n");
    expect(d.title).toBe('Stack overflow');
    expect(d.hint).toMatch(/recursion/);
  });

  test('an unrecognised panic still reports the location', () => {
    const out = "thread 'main' panicked at src/lib.rs:12:9:\nsomething unusual";
    const d = diagnose('run', 101, out);
    expect(d.title).toBe('Panicked at runtime');
    expect(d.hint).toContain('src/lib.rs:12:9');
  });
});

describe('compile errors', () => {
  test('E0308 is described in words, not a code', () => {
    const out = 'error[E0308]: mismatched types\n --> src/lib.rs:4:5';
    expect(diagnose('test', 101, out).title).toBe('Compile error: mismatched types');
  });

  test('E0382 points at ownership', () => {
    const d = diagnose('test', 101, 'error[E0382]: borrow of moved value: `s`');
    expect(d.title).toBe('Compile error: value moved');
    expect(d.hint).toMatch(/clone|borrow/i);
  });

  test('an unknown error code still names itself', () => {
    expect(diagnose('test', 101, 'error[E0271]: type mismatch resolving').title).toBe(
      'Compile error E0271',
    );
  });

  test('a syntax error with no code is still recognised', () => {
    const out = 'error: expected one of `!`, `.`, `::`, `;`, found `is`';
    expect(diagnose('test', 101, out).title).toBe('Compile error');
  });

  test('ANSI colour does not defeat matching', () => {
    const out = '[1m[38;5;9merror[E0308][0m: mismatched types';
    expect(diagnose('test', 101, out).title).toBe('Compile error: mismatched types');
  });
});

describe('failing assertions', () => {
  test('the count comes from the summary line', () => {
    const out = 'test result: FAILED. 3 passed; 2 failed; 0 ignored';
    const d = diagnose('test', 101, out);
    expect(d.title).toBe('2 of 5 tests failed');
    expect(d.hint).toMatch(/assert_eq/);
  });
});

describe('resource limits', () => {
  test('137 is memory, not a mystery', () => {
    const d = diagnose('run', 137, '');
    expect(d.title).toBe('Ran out of memory');
    expect(d.hint).toMatch(/recursion|collection/);
  });

  test('124 is a timeout', () => {
    expect(diagnose('run', 124, '').title).toBe('Timed out');
  });
});

describe('regressions found against real cargo output', () => {
  test('a thread id in the panic line does not defeat matching', () => {
    // Rust prints `thread 'main' (7) panicked at ...`. An earlier pattern
    // required the quote to be followed directly by "panicked", so this fell
    // through to cargo's `error: test failed` summary and was reported as a
    // compile error.
    const out = [
      "thread 'test_min_and_max' (140) panicked at src/main.rs:14:5:",
      'assertion `left == right` failed',
      'test result: FAILED. 0 passed; 1 failed; 0 ignored',
      'error: test failed, to rerun pass `--bin min_and_max_test`',
    ].join('\n');
    const d = diagnose('test', 101, out);
    expect(d.title).toBe('1 of 1 tests failed');
  });

  test("cargo's summary lines are never the diagnosis", () => {
    // `error: test failed` and `error: could not compile` restate something
    // already reported above them.
    expect(diagnose('test', 101, 'error: test failed, to rerun pass `--bin x`').title).not.toBe(
      'Compile error',
    );
    expect(diagnose('test', 101, 'error: could not compile `min_and_max` (lib)').title).not.toBe(
      'Compile error',
    );
  });

  test('an index proven out of bounds is a compile error, not a runtime panic', () => {
    // rustc const-evaluates this and refuses to build, so calling it a runtime
    // panic would send the student looking in the wrong place.
    const out = [
      'error: this operation will panic at runtime',
      '  |    ^^^^ index out of bounds: the length is 3 but the index is 9',
      'error: could not compile `min_and_max` (lib) due to 1 previous error',
    ].join('\n');
    const d = diagnose('test', 101, out);
    expect(d.title).toBe('Compile error: guaranteed panic');
    expect(d.hint).toContain('Index 9');
  });
});

describe('fallback', () => {
  test('an unrecognised failure never shows a bare exit code', () => {
    const d = diagnose('run', 101, 'something entirely unexpected');
    expect(d.title).toBe('Run failed');
    expect(d.title).not.toMatch(/101/);
    expect(d.hint).toBeTruthy();
  });
});
