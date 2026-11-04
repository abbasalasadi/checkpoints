/**
 * Turn a run result into something a student can act on.
 *
 * Pure, and the only place a run outcome becomes words. Tested directly in
 * `web/tests/diagnostics.test.ts`, which pins the wording — these sentences are the whole of what
 * a stuck student has to go on, and they are easy to break from a component.
 *
 * The harness exits non-zero for a failing assertion, a syntax error and a
 * banned construct alike, so the exit code alone is never enough — the output
 * says which. This is an index of the failures these 31 exercises actually
 * produce, matched in order from most specific to most general.
 *
 * Hints are one line and tell the student what to DO. They never restate the
 * error, which is already on screen.
 */

/** The JS reference's run outcomes. */
export type Outcome = 'passed' | 'failed' | 'cancelled' | 'timeout' | 'output_limit' | 'oom' | 'error';

export type Tone = 'ok' | 'error' | 'warn';

/**
 * The runner's limits, passed in rather than hard-coded.
 *
 * A message that names "90 seconds" when the server stops runs at 60 is worse than one that names
 * no number at all, and these are configurable — so they come from `/api/runner`.
 */
export interface Limits {
  timeoutSeconds?: number;
  outputLimitBytes?: number;
}

export interface Diagnosis {
  /** Short label for the toolbar. */
  title: string;
  /** One actionable line. Omitted when the error already says it. */
  hint?: string;
  tone: Tone;
}

interface Rule {
  test: RegExp;
  build: (m: RegExpExecArray, kind: 'run' | 'submit') => Diagnosis;
}

/** Ordered most specific first — the first match wins. */
const RULES: Rule[] = [
  // ── the starting stub ──────────────────────────────────────────────────────
  {
    test: /Your implementation here/,
    build: () => ({
      title: 'Not implemented yet',
      hint: 'This is the starting stub. Write your solution in place of the comment.',
      tone: 'error',
    }),
  },

  // ── the harness's own rules ────────────────────────────────────────────────
  {
    // Test and solution are concatenated into one module, so a name declared by
    // both is a syntax error before a single test runs. It is the single most
    // confusing failure here, because nothing in the student's file looks wrong.
    test: /Identifier '([^']+)' has already been declared/,
    build: (m) => ({
      title: `"${m[1]}" is declared twice`,
      hint: `${m[1]} is defined more than once. Look for a leftover empty starter line (function ${m[1]}(…) {}) above your code and delete it. If your file has only one, the test file already defines ${m[1]}: Rename yours or move it inside your function.`,
      tone: 'error',
    }),
  },
  {
    test: /import keyword not allowed/,
    build: () => ({
      title: 'import is not allowed',
      hint: 'Your file runs as a plain script. Everything you need is already global — remove the import.',
      tone: 'error',
    }),
  },
  {
    test: /process\.exit\(\d*\) is not allowed/,
    build: () => ({
      title: 'process.exit is not allowed',
      hint: 'Return your value instead of exiting — the test needs the function to finish normally.',
      tone: 'error',
    }),
  },
  {
    test: /Time limit reached \(1min\)/,
    build: () => ({
      title: 'One test took over a minute',
      hint: 'Something is looping much longer than intended. Check your exit condition.',
      tone: 'error',
    }),
  },
  {
    test: /Missing (?:student solution|test) for (\S+)/,
    build: (m) => ({
      title: `Nothing to run for ${m[1]}`,
      hint: 'Your file came through empty. Write something and submit again.',
      tone: 'error',
    }),
  },

  // ── ordinary JavaScript errors ─────────────────────────────────────────────
  {
    test: /ReferenceError: (\w+) is not defined/,
    build: (m) => ({
      title: `${m[1]} is not defined`,
      hint: `The test calls ${m[1]}. Define it at the top level of your file, spelled exactly that way.`,
      tone: 'error',
    }),
  },
  {
    test: /TypeError: (.+?) is not a function/,
    build: (m) => ({
      title: `${(m[1] ?? 'That').trim()} is not a function`,
      hint: 'Check the type you are calling — an array method on an object, or a value that came back undefined.',
      tone: 'error',
    }),
  },
  {
    test: /TypeError: Cannot read properties of (undefined|null) \(reading '([^']+)'\)/,
    build: (m) => ({
      title: `Read ".${m[2]}" of ${m[1]}`,
      hint: 'Something was missing before you reached into it. Guard the value, or check the earlier step returned what you expect.',
      tone: 'error',
    }),
  },
  {
    test: /RangeError: Maximum call stack size exceeded/,
    build: () => ({
      title: 'Infinite recursion',
      hint: 'A function keeps calling itself. Check the base case that should stop it.',
      tone: 'error',
    }),
  },
  {
    test: /SyntaxError: (.+)/,
    build: (m) => ({ title: 'Syntax error', hint: m[1]?.trim(), tone: 'error' }),
  },
  {
    test: /AssertionError|Expected values to be strictly deep-equal/,
    build: () => ({
      title: 'Wrong answer',
      hint: 'Your code ran, but returned something the test did not expect. The comparison is above.',
      tone: 'error',
    }),
  },
  {
    test: /test #(\d+) failed/,
    build: (m) => ({
      title: `Test ${m[1]} failed`,
      hint: 'The failing test is printed above, exactly as the checkpoint would run it.',
      tone: 'error',
    }),
  },
];

/** ANSI escapes would defeat the patterns above; the terminal keeps its copy. */
const decolour = (output: string): string => output.replace(/\x1b\[[0-9;]*m/g, '');

export function diagnose(
  kind: 'run' | 'submit',
  outcome: Outcome,
  output: string,
  limits: Limits = {},
): Diagnosis {
  if (outcome === 'passed') {
    if (kind === 'submit') return { title: 'Passed', tone: 'ok' };
    // A run that prints nothing is the commonest confusion here: the graded file only defines a
    // function, so without a call there is nothing to see. Say so rather than leave a blank pane.
    return output.trim() === ''
      ? {
          title: 'Finished, printed nothing',
          hint: 'main.js is what Run executes — call your function there, or add a console.log.',
          tone: 'ok',
        }
      : { title: 'Finished', tone: 'ok' };
  }
  if (outcome === 'cancelled') {
    return { title: 'Cancelled', hint: 'You stopped this run.', tone: 'warn' };
  }
  if (outcome === 'timeout') {
    const after = limits.timeoutSeconds ? ` after ${limits.timeoutSeconds} seconds` : '';
    return {
      title: 'Timed out',
      hint: `Your code was still running${after}, so it was stopped. Look for a loop that never ends, or recursion with no base case.`,
      tone: 'warn',
    };
  }
  if (outcome === 'output_limit') {
    const cap = limits.outputLimitBytes ? ` (${Math.round(limits.outputLimitBytes / 1024)} KB)` : '';
    return {
      title: 'Printed too much',
      hint: `Your code printed more than a run carries${cap}, so it was stopped. A console.log inside a loop that never ends does this.`,
      tone: 'warn',
    };
  }
  if (outcome === 'oom') {
    return {
      title: 'Out of memory',
      hint: 'Your code kept allocating — often an array or recursion that never stops growing.',
      tone: 'warn',
    };
  }
  if (outcome === 'error') {
    // The distinction worth drawing: nothing of the student's ran, so nothing they wrote is at
    // fault. Without saying so, "Could not run" reads as another failure to debug.
    return {
      title: 'Could not run',
      hint: 'The runner could not start this run, so your code never ran. Try again in a moment.',
      tone: 'error',
    };
  }

  const plain = decolour(output);
  for (const rule of RULES) {
    const match = rule.test.exec(plain);
    if (match) return rule.build(match, kind);
  }
  return { title: kind === 'submit' ? 'Failed' : 'Finished with an error', tone: 'error' };
}
