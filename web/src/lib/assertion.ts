/**
 * Assertion diff (V3 feature 4): pull "expected" and "got" out of a failed
 * test's output, so the card can show them side by side. Only shapes the
 * testers really print are read; anything else returns null and the plain
 * output stays the only view.
 *   go    program: "Your program output is not correct :" ... "Expected :" ...
 *         function: "F(x) == got instead of want"
 *   rust  assert_eq!: "left: …" / "right: …" (left is the student's value)
 *   js    node:assert: "a !== b", or the "+ actual - expected" diff
 */
import type { Language } from './api.js';

export interface AssertionDiff {
  expected: string;
  actual: string;
  /** What was being checked, when the output says. */
  label?: string;
}

const ANSI = /\x1b\[[0-9;]*[A-Za-z]/g;

function goDiff(out: string): AssertionDiff | null {
  const prog = /Your program output is not correct :\s*\n([\s\S]*?)\n\s*Expected :\s*\n([\s\S]*?)(?:\nexit status \d+|\n?$)/.exec(out);
  if (prog?.[1] !== undefined && prog[2] !== undefined) {
    return { actual: prog[1].trim(), expected: prog[2].trim() };
  }
  for (const line of out.split('\n')) {
    const m = /^(?:\S+ \S+ )?(.*?)\s+(?:==|=)\s+(.*) instead of (.*)$/.exec(line.trim()) ?? /^(?:got:)\s*(.*) instead of (.*)$/.exec(line.trim());
    if (m && m.length === 4) return { label: m[1], actual: m[2]!, expected: m[3]! };
    if (m && m.length === 3) return { actual: m[1]!, expected: m[2]! };
  }
  return null;
}

function rustDiff(out: string): AssertionDiff | null {
  const m = /assertion (?:`left == right` failed|failed: `\(left == right\)`)[^\n]*\n\s*left: `?(.*?)`?,?\n\s*right: `?(.*?)`?\s*(?:\n|$)/.exec(out);
  return m?.[1] !== undefined && m[2] !== undefined ? { actual: m[1], expected: m[2] } : null;
}

function jsDiff(out: string): AssertionDiff | null {
  const head = /Expected values to be (?:strictly |loosely )?(?:deep-)?equal:?\s*\n/.exec(out);
  if (!head) return null;
  const rest = out.slice(head.index + head[0].length);
  const simple = /^\s*\n?(.+?) !== (.+?)\s*$/m.exec(rest);
  if (simple?.[1] && simple[2] && !rest.trimStart().startsWith('+ actual')) return { actual: simple[1], expected: simple[2] };
  const lines = rest.replace(/^\s*\+ actual - expected\s*\n/, '').split('\n');
  const actual: string[] = [];
  const expected: string[] = [];
  for (const l of lines) {
    if (/^\s+at /.test(l) || /^\S+Error/.test(l)) break;
    if (l.startsWith('+ ')) actual.push(l.slice(2));
    else if (l.startsWith('- ')) expected.push(l.slice(2));
    else if (l.startsWith('  ')) {
      actual.push(l.slice(2));
      expected.push(l.slice(2));
    }
  }
  if (actual.length === 0 && expected.length === 0) return null;
  return { actual: actual.join('\n').trim(), expected: expected.join('\n').trim() };
}

export function parseAssertion(language: Language, output: string): AssertionDiff | null {
  const out = output.replace(ANSI, '').replace(/\r\n/g, '\n');
  const d = language === 'go' ? goDiff(out) : language === 'rust' ? rustDiff(out) : jsDiff(out);
  if (!d || d.actual === d.expected) return null;
  return d;
}

/** Index of the first character where the two differ, or -1. */
export function firstDifference(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length === b.length ? -1 : n;
}
