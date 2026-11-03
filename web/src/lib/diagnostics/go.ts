// The only place an outcome becomes words, and it is pure. These sentences are
// the whole of what a stuck student has to go on, so they are pinned by tests
// and must not be reinvented inside a component.
/** The runner limits the Go wording names. All optional: a missing number prints as a dash. */
export type Limits = { timeoutSeconds?: number; outputLimitKb?: number; memoryMb?: number }

export type Outcome =
  | 'passed' | 'failed' | 'unformatted' | 'forbidden' | 'build_error'
  | 'missing_file' | 'timeout' | 'output_limit' | 'oom' | 'error'

export type Tone = 'good' | 'warn' | 'bad' | 'info'

export type Diagnosis = { title: string; tone: Tone; hint: string | null; canFormat: boolean }

/**
 * `mode` matters for two outcomes. During Submit the harness captures the
 * student's stdout inside the test process — challenge.Program with
 * CombinedOutput(), challenge.Function through an os.Pipe — so a print inside an
 * unbounded loop never reaches the container's stdout and never trips the output
 * cap. It arrives as memory growth or as the clock running out instead, and the
 * two causes are indistinguishable from outside. So say both, rather than
 * confidently naming the wrong one. docs/04-execution.md §4.
 */
export function diagnose(
  outcome: Outcome,
  output: string,
  limits: Limits | null,
  mode: 'run' | 'submit' = 'submit',
  hasDemo = false,
): Diagnosis {
  switch (outcome) {
    case 'passed':
      // Only Submit verifies anything. Run skips both gates and every test — it
      // compiles the student's code and executes it, so exit 0 says the program
      // finished, not that the answer is right. Both siblings keep "Passed" for
      // Submit for exactly this reason.
      if (mode === 'submit') return { title: 'Passed', tone: 'good', hint: null, canFormat: false }
      return output.trim() === ''
        ? {
            // The commonest confusion in Run: a function exercise prints nothing
            // until the demo calls it. A blank pane looks broken; say why.
            title: 'Finished, printed nothing', tone: 'good', canFormat: false,
            hint: hasDemo
              ? 'main.go is what Run executes — call your function there to see its output.'
              : 'Your program produced no output. Check the arguments beside Run.',
          }
        : {
            title: 'Finished', tone: 'good', canFormat: false,
            hint: 'Nothing was checked — compare the output with the subject, then Submit.',
          }

    case 'failed':
      // The harness's own line is already in the output pane. Repeating it here
      // is noise, so the hint appears only when nothing useful was printed.
      if (mode === 'run') {
        return {
          title: 'Run failed', tone: 'bad', canFormat: false,
          hint: wrongPackage(output)
            ?? 'Your program exited with an error. Read the output above — the first line usually says why.',
        }
      }
      return {
        title: 'Tests failed', tone: 'bad', canFormat: false,
        hint: firstAssertion(output) ? null : 'Read the first line above: it shows what was expected.',
      }

    case 'unformatted':
      return {
        // Not an error. The real checkpoint applies this gate before it runs a
        // single test, and meeting it here is the point.
        title: 'Not formatted', tone: 'info', canFormat: true,
        hint: 'The platform runs gofumpt before any test and rejects code it would rewrite. Format my code fixes it.',
      }

    case 'forbidden':
      return {
        title: 'Function not allowed', tone: 'info', canFormat: false,
        hint: forbiddenSymbol(output)
          ? `${forbiddenSymbol(output)} is not in this exercise's allowed list — see the panel under the subject.`
          : "This exercise allows only the functions listed under the subject.",
      }

    case 'build_error':
      // The compiler already said it, better than we could — except for the one
      // message that names neither the file nor the fix.
      return { title: 'Does not compile', tone: 'bad', canFormat: false, hint: wrongPackage(output) }

    case 'missing_file':
      return { title: 'Nothing to grade', tone: 'bad', canFormat: false, hint: 'No Go file was submitted.' }

    case 'timeout':
      return {
        title: 'Timed out', tone: 'warn', canFormat: false,
        hint:
          `Stopped after ${limits?.timeoutSeconds ?? '—'}s. Look for a loop whose condition never becomes false, or recursion with no base case.` +
          (mode === 'submit' ? ' Printing inside a loop can also land here — try Run to see the output.' : ''),
      }

    case 'output_limit':
      return {
        title: 'Printed too much', tone: 'warn', canFormat: false,
        hint: `More than ${limits?.outputLimitKb ?? '—'} KB of output. This is usually a print inside an endless loop — not a slow program.`,
      }

    case 'oom':
      return {
        title: 'Out of memory', tone: 'warn', canFormat: false,
        hint:
          `The run passed ${limits?.memoryMb ?? '—'} MB. Something is allocating without bound` +
          (mode === 'submit'
            // Grading buffers everything the program prints, so a runaway
            // printer shows up as memory rather than as output. Naming only
            // allocation would send a student looking in the wrong place.
            ? ' — or printing inside a loop, which grading holds in memory. Try Run: if it floods the output pane, that is the cause.'
            : '.'),
      }

    case 'error':
    default:
      return {
        // Nothing of theirs ran, so nothing they wrote is at fault. Without
        // saying so this reads as another failure to debug.
        title: 'Could not run', tone: 'warn', canFormat: false,
        hint: 'The run did not start. Nothing you wrote caused this — try again.',
      }
  }
}

/**
 * The worst failure this app can produce, translated.
 *
 * The demo does `import "piscine"`. If the graded file declares any other
 * package the compiler says `"piscine" imported as solutions and not used` —
 * which names the demo's line, not the file that is actually wrong. And it only
 * happens on Run: the tester imports the graded file under an alias, so Submit
 * passes with the same code. Nothing about that is guessable.
 */
function wrongPackage(output: string): string | null {
  const m = /"piscine" imported as (\w+) and not used/.exec(output)
  return m
    ? `Your graded file says \`package ${m[1]}\` — it has to be \`package piscine\`, which is what the demo imports.`
    : null
}

/** The harness prints `Gcd(42, 10) == 3 instead of 2` as its first useful line. */
function firstAssertion(output: string): string | null {
  const line = output.split('\n').map((l) => l.trim()).find((l) => l.includes(' instead of '))
  return line ?? null
}

/** rc's table: `illegal-import  fmt  main.go:4:2`. */
function forbiddenSymbol(output: string): string | null {
  for (const raw of output.split('\n')) {
    const parts = raw.trim().split(/\s{2,}|\t+/).filter(Boolean)
    if (parts.length >= 2 && parts[0]?.startsWith('illegal')) return parts[1] ?? null
  }
  if (/print\s*&\s*println/.test(output)) return 'print / println'
  return null
}
