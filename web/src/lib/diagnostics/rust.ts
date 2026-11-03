/**
 * Turn a cargo result into something a student can act on.
 *
 * Cargo returns 101 for a compile error, a panic and a failing test alike, so
 * the exit code alone is never enough — the output says which. This is an index
 * of the failures these 40 exercises actually produce, matched in order from
 * most specific to most general.
 *
 * Hints are one line and tell the student what to DO. They never restate the
 * error, which is already on screen.
 */

export type Tone = 'ok' | 'error';

export interface Diagnosis {
  /** Short label for the toolbar. */
  title: string;
  /** One actionable line, shown under the output. Omitted when the error already says it. */
  hint?: string;
  tone: Tone;
}

interface Rule {
  /** Matched against the de-coloured output. */
  test: RegExp;
  build: (m: RegExpExecArray, kind: 'run' | 'test') => Diagnosis;
}

/** Ordered most specific first — the first match wins. */
const RULES: Rule[] = [
  // ── the starting stub ──────────────────────────────────────────────────────
  {
    test: /not yet implemented/,
    build: () => ({
      title: 'Not implemented yet',
      hint: 'This is the starting stub. Replace todo!() with your own code.',
      tone: 'error',
    }),
  },

  // ── panics, commonest first ────────────────────────────────────────────────
  {
    test: /index out of bounds: the len is (\d+) but the index is (\d+)/,
    build: (m) => ({
      title: 'Panicked: index out of bounds',
      hint: `Indexed position ${m[2]} of something ${m[1]} long. Check the loop bound, or use .get() which returns an Option.`,
      tone: 'error',
    }),
  },
  {
    test: /called `Option::unwrap\(\)` on a `None` value/,
    build: () => ({
      title: 'Panicked: unwrapped a None',
      hint: 'A value was missing. Handle it with match, if let, or unwrap_or instead of .unwrap().',
      tone: 'error',
    }),
  },
  {
    test: /called `Result::unwrap\(\)` on an `Err` value/,
    build: () => ({
      title: 'Panicked: unwrapped an Err',
      hint: 'An operation failed. Handle the Err case with match or ? instead of .unwrap().',
      tone: 'error',
    }),
  },
  {
    test: /attempt to (add|subtract|multiply|divide|negate).* with overflow/,
    build: (m) => ({
      title: `Panicked: ${m[1]} overflowed`,
      hint: 'The result did not fit the integer type. Try a wider type, or the wrapping_/checked_ methods.',
      tone: 'error',
    }),
  },
  {
    test: /attempt to divide by zero/,
    build: () => ({
      title: 'Panicked: divided by zero',
      hint: 'Guard the divisor before dividing.',
      tone: 'error',
    }),
  },
  {
    test: /byte index \d+ is out of bounds|is not a char boundary/,
    build: () => ({
      title: 'Panicked: bad string slice',
      hint: 'Rust strings are UTF-8, so byte indexes must land on character boundaries. Prefer .chars().',
      tone: 'error',
    }),
  },
  {
    test: /has overflowed its stack/,
    build: () => ({
      title: 'Stack overflow',
      hint: 'Almost always infinite recursion — check that your base case is reached.',
      tone: 'error',
    }),
  },
  // ── failing assertions ─────────────────────────────────────────────────────
  {
    test: /test result: FAILED\. (\d+) passed; (\d+) failed/,
    build: (m) => ({
      title: `${m[2]} of ${Number(m[1]) + Number(m[2])} tests failed`,
      hint: 'Scroll up to the first assert_eq! — it shows what was expected against what you returned.',
      tone: 'error',
    }),
  },
  {
    test: /assertion .*failed|test result: FAILED/,
    build: () => ({
      title: 'Tests failed',
      hint: 'Scroll up to the first failing assertion to see expected against actual.',
      tone: 'error',
    }),
  },
  {
    test: /thread '[^']*'(?: \(\d+\))? panicked at ([^\n]*)/,
    build: (m) => ({
      title: 'Panicked at runtime',
      hint: `It compiled, then failed while running — at ${m[1]?.trim()}`,
      tone: 'error',
    }),
  },

  // ── rustc proved it panics, so it refused to compile ───────────────────────
  {
    test: /this operation will panic at runtime[\s\S]*?index out of bounds: the length is (\d+) but the index is (\d+)/,
    build: (m) => ({
      title: 'Compile error: guaranteed panic',
      hint: `Index ${m[2]} on something ${m[1]} long. rustc proved this always panics, so it refused to build.`,
      tone: 'error',
    }),
  },
  {
    test: /this operation will panic at runtime/,
    build: () => ({
      title: 'Compile error: guaranteed panic',
      hint: 'rustc proved this operation always panics, so it refused to build it.',
      tone: 'error',
    }),
  },

  // ── compile errors students hit most ───────────────────────────────────────
  {
    test: /error\[E0308\]/,
    build: () => ({
      title: 'Compile error: mismatched types',
      hint: 'The type produced is not the type expected. The error shows both — check the return type and the arguments.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0425\]/,
    build: () => ({
      title: 'Compile error: name not found',
      hint: 'A variable or function name is undefined here — check the spelling and whether it is in scope.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0382\]/,
    build: () => ({
      title: 'Compile error: value moved',
      hint: 'The value was moved and then used again. Borrow it with & instead, or .clone() it.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0502\]|error\[E0499\]/,
    build: () => ({
      title: 'Compile error: conflicting borrows',
      hint: 'You cannot borrow mutably while another borrow is alive. Shorten one borrow, or finish reading before writing.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0596\]|error\[E0594\]/,
    build: () => ({
      title: 'Compile error: needs to be mutable',
      hint: 'Add mut to the binding, or take &mut where the function expects it.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0106\]/,
    build: () => ({
      title: 'Compile error: missing lifetime',
      hint: 'A returned reference needs a lifetime tied to an input. Returning an owned String often avoids this.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0432\]|error\[E0433\]/,
    build: () => ({
      title: 'Compile error: unresolved import',
      hint: 'The path does not exist. Check the use statement and that the module is declared.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0061\]/,
    build: () => ({
      title: 'Compile error: wrong number of arguments',
      hint: 'The call does not match the signature the test expects — keep the given signature exactly.',
      tone: 'error',
    }),
  },
  {
    test: /error\[E0599\]/,
    build: () => ({
      title: 'Compile error: no such method',
      hint: 'That method does not exist for this type. Check the type you actually have.',
      tone: 'error',
    }),
  },
  {
    test: /error\[(E\d+)\]/,
    build: (m) => ({
      title: `Compile error ${m[1]}`,
      hint: 'Read the first error only — later ones are often knock-on effects of it.',
      tone: 'error',
    }),
  },
  {
    // `error: test failed` and `error: could not compile` are cargo summarising
    // something already reported above; they are never the real diagnosis.
    test: /^error: (?!test failed|could not compile|aborting)/m,
    build: () => ({
      title: 'Compile error',
      hint: 'Read the first error only — later ones are often knock-on effects of it.',
      tone: 'error',
    }),
  },

];

/** Exit codes that mean something specific regardless of the output. */
const BY_CODE: Record<number, Diagnosis> = {
  124: {
    title: 'Timed out',
    hint: 'The run was stopped for taking too long — usually an infinite loop.',
    tone: 'error',
  },
  137: {
    title: 'Ran out of memory',
    hint: 'The container hit its memory limit — usually runaway recursion or an ever-growing collection.',
    tone: 'error',
  },
  139: {
    title: 'Crashed (segmentation fault)',
    hint: 'Rare in safe Rust — check any unsafe block.',
    tone: 'error',
  },
};

export function diagnose(kind: 'run' | 'test', exitCode: number, output: string): Diagnosis {
  if (exitCode === 0) {
    // Only Submit verifies anything. A clean Run means the code compiled and
    // finished without panicking — it says nothing about whether the output is
    // right, so it must not read like a pass.
    return kind === 'test'
      ? { title: 'Passed', tone: 'ok' }
      : {
          // Mirrors "Compile error" on the failure side. The hint carries the
          // part the single word leaves out: nothing verified the output.
          title: 'Compiled',
          hint: 'Compare the output above with the expected output in the instructions, then Submit.',
          tone: 'ok',
        };
  }

  const byCode = BY_CODE[exitCode];
  if (byCode) return byCode;

  // Strip ANSI colour before matching, or the escapes break the patterns.
  const plain = output.replace(/\[[0-9;]*m/g, '');

  for (const rule of RULES) {
    const m = rule.test.exec(plain);
    if (m) return rule.build(m, kind);
  }

  return {
    title: kind === 'test' ? 'Test run failed' : 'Run failed',
    hint: 'Read the output above — the first error line usually says why.',
    tone: 'error',
  };
}
