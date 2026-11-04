/**
 * Assertion diff parsing (V3): each tester's real failure shape yields
 * expected and got; anything else yields nothing rather than a wrong card.
 */
import { describe, expect, test } from 'vitest';
import { firstDifference, parseAssertion } from '../src/lib/assertion.js';

describe('go', () => {
  test('program output against the expected output', () => {
    const out = 'Your program output is not correct :\n\n$ go run .\n$\n\nExpected :\n\n$ go run .\nf$\nexit status 1\n';
    expect(parseAssertion('go', out)).toEqual({ actual: '$ go run .\n$', expected: '$ go run .\nf$' });
  });

  test('a function result', () => {
    expect(parseAssertion('go', 'Gcd(42, 10) == 3 instead of 2\n')).toEqual({ label: 'Gcd(42, 10)', actual: '3', expected: '2' });
    expect(parseAssertion('go', 'FirstWord("a b") = "b" instead of "a"\n')).toMatchObject({ actual: '"b"', expected: '"a"' });
  });
});

describe('rust', () => {
  test('assert_eq! in both message styles', () => {
    const now = "thread 'x' panicked at src/main.rs:3:5:\nassertion `left == right` failed\n  left: 3\n right: 4\n";
    expect(parseAssertion('rust', now)).toEqual({ actual: '3', expected: '4' });
    const old = "assertion failed: `(left == right)`\n  left: `\"ab\"`,\n right: `\"ba\"`\n";
    expect(parseAssertion('rust', old)).toEqual({ actual: '"ab"', expected: '"ba"' });
  });
});

describe('js', () => {
  test('a strict equality', () => {
    expect(parseAssertion('js', 'AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:\n\n1 !== 2\n\n    at test')).toEqual({ actual: '1', expected: '2' });
  });

  test('a deep-equal diff', () => {
    const out = 'Expected values to be strictly deep-equal:\n+ actual - expected\n\n  [\n+   1\n-   2\n  ]\n    at x';
    expect(parseAssertion('js', out)).toEqual({ actual: '[\n  1\n]', expected: '[\n  2\n]' });
  });
});

test('unknown output gives no card', () => {
  expect(parseAssertion('go', 'panic: runtime error')).toBeNull();
  expect(parseAssertion('js', 'SyntaxError: Unexpected token')).toBeNull();
});

test('first difference', () => {
  expect(firstDifference('abc', 'abd')).toBe(2);
  expect(firstDifference('ab', 'abc')).toBe(2);
  expect(firstDifference('ab', 'ab')).toBe(-1);
});
