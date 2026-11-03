import assert from 'node:assert/strict'
import { test } from 'vitest'
import { diagnose } from '../src/lib/diagnostics/go.js'
import { lint, splitArgs } from '../src/lib/lint/go.js'

const limits = {
  timeoutSeconds: 60, warnSeconds: 20, cooldownRunSeconds: 30, cooldownSubmitSeconds: 90,
  outputLimitKb: 256, memoryMb: 256, maxConcurrent: 3,
}

test('a pass says so and offers nothing else', () => {
  const d = diagnose('passed', '', limits)
  assert.equal(d.title, 'Passed')
  assert.equal(d.hint, null)
})

test('Run never claims a pass — nothing was verified', () => {
  // Run skips both gates and every test. Saying "Passed" would tell a student
  // their answer is right when all that happened is that it compiled and ran.
  const d = diagnose('passed', 'hello\n', limits, 'run')
  assert.equal(d.title, 'Finished')
  assert.notEqual(d.title, 'Passed')
  assert.match(d.hint!, /Nothing was checked/)
  assert.equal(diagnose('passed', '', limits, 'submit').title, 'Passed')
})

test('a silent Run is explained, and differently for a demo file', () => {
  const withDemo = diagnose('passed', '', limits, 'run', true)
  assert.equal(withDemo.title, 'Finished, printed nothing')
  assert.match(withDemo.hint!, /main\.go/)
  assert.doesNotMatch(diagnose('passed', '', limits, 'run', false).hint!, /main\.go/)
})

test('a non-zero exit in Run is not reported as a test failure', () => {
  assert.equal(diagnose('failed', '', limits, 'run').title, 'Run failed')
  assert.equal(diagnose('failed', '', limits, 'submit').title, 'Tests failed')
})

test('a failure adds no hint when the harness already said it', () => {
  // The assertion is in the output pane a few pixels above. Repeating it is noise.
  const d = diagnose('failed', 'Gcd(42, 10) == 3 instead of 2\n', limits)
  assert.equal(d.title, 'Tests failed')
  assert.equal(d.hint, null)
})

test('a failure that printed nothing useful still points somewhere', () => {
  const d = diagnose('failed', '', limits)
  assert.match(d.hint!, /first line above/)
})

test('the package-clause error is translated — the compiler names the wrong file', () => {
  // `package solutions` in the graded file: the demo's import breaks, and the
  // compiler blames demo/main.go, which is not the file to edit.
  const out = 'demo/main.go:5:2: "piscine" imported as solutions and not used\n'
  assert.match(diagnose('failed', out, limits, 'run').hint!, /package solutions.*package piscine/)
  assert.match(diagnose('build_error', out, limits, 'submit').hint!, /package piscine/)
})

test('the lint names a wrong package clause before anything is run', () => {
  const hits = lint({ 'gcd.go': 'package solutions\n\nfunc Gcd() {}\n' }, [], 'piscine')
  assert.equal(hits.length, 1)
  assert.match(hits[0]!.message, /must be "package piscine", not "package solutions"/)
  assert.equal(hits[0]!.line, 1)
  // The right one is silent, and so is a lint with no package to check against.
  assert.equal(lint({ 'gcd.go': 'package piscine\n' }, [], 'piscine').length, 0)
  assert.equal(lint({ 'gcd.go': 'package solutions\n' }, []).length, 0)
})

test('a compile error adds no hint — the compiler said it better', () => {
  assert.equal(diagnose('build_error', 'x.go:3:8: undefined: foo', limits).hint, null)
})

test('formatting reads as instruction, not failure, and offers the fix', () => {
  const d = diagnose('unformatted', '', limits)
  assert.equal(d.tone, 'info')
  assert.equal(d.canFormat, true)
})

test('a forbidden call names the symbol rc named', () => {
  const d = diagnose('forbidden', 'Cheating:\n\tillegal-import\tfmt\tmain.go:4:2\n', limits)
  assert.match(d.hint!, /^fmt is not in/)
})

test('the builtin rejection is recognised even though rc prints no table', () => {
  const d = diagnose('forbidden', 'Your Go files cannot use print & println builtins\n', limits)
  assert.match(d.hint!, /print \/ println/)
})

test('during Submit, oom and timeout name printing too — the harness hides it', () => {
  // challenge.Program buffers the student's stdout in the test process, so a
  // print inside a loop cannot trip the output cap. Saying only "allocating"
  // would send the student looking in the wrong place.
  assert.match(diagnose('oom', '', limits, 'submit').hint!, /printing inside a loop/)
  assert.match(diagnose('timeout', '', limits, 'submit').hint!, /Printing inside a loop/)
})

test('during Run the output cap works, so the hints stay narrow', () => {
  assert.doesNotMatch(diagnose('oom', '', limits, 'run').hint!, /printing inside a loop/)
  assert.doesNotMatch(diagnose('timeout', '', limits, 'run').hint!, /Printing inside a loop/)
})

test('timeout, output_limit and oom stay distinct and quote the real limit', () => {
  assert.match(diagnose('timeout', '', limits).hint!, /60s/)
  assert.match(diagnose('output_limit', '', limits).hint!, /256 KB/)
  assert.match(diagnose('oom', '', limits).hint!, /256 MB/)
  const titles = new Set(['timeout', 'output_limit', 'oom'].map((o) => diagnose(o as never, '', limits).title))
  assert.equal(titles.size, 3)
})

test('an infrastructure error says the student is not at fault', () => {
  assert.match(diagnose('error', '', limits).hint!, /Nothing you wrote/)
})

test('every outcome yields a title', () => {
  for (const o of ['passed','failed','unformatted','forbidden','build_error','missing_file','timeout','output_limit','oom','error'] as const) {
    assert.ok(diagnose(o, '', limits).title.length > 0, o)
  }
})

test('the lint flags a call outside the allowed list', () => {
  const hits = lint({ 'onlya/main.go': 'package main\nfunc main() { fmt.Println("a") }\n' },
    ['github.com/01-edu/z01.PrintRune', '--allow-builtin'])
  assert.equal(hits.length, 1)
  assert.match(hits[0]!.message, /fmt\.Println/)
})

test('the lint allows a wildcard package and the exercise entry point', () => {
  assert.equal(lint({ 'a.go': 'package piscine\nfunc f() { os.Exit(1) }\n' }, ['os.*']).length, 0)
  assert.equal(lint({ 'main.go': 'package main\nfunc main() { piscine.Gcd(1,2) }\n' }, []).length, 0)
})

test('the lint ignores comments and strings', () => {
  const hits = lint({ 'a.go': 'package piscine\n// fmt.Println("x")\nvar s = "fmt.Println(1)"\n' }, [])
  assert.equal(hits.length, 0)
})

test('the lint flags println, which is legal Go and rejected by the tester', () => {
  const hits = lint({ 'a.go': 'package piscine\nfunc f() { println("x") }\n' }, ['--allow-builtin'])
  assert.equal(hits.length, 1)
})

test('arguments split shell-style, keeping quoted and empty ones', () => {
  assert.deepEqual(splitArgs('a b'), ['a', 'b'])
  assert.deepEqual(splitArgs('"{[(0 + 0)]}" ""'), ['{[(0 + 0)]}', ''])
  assert.deepEqual(splitArgs("'one two'  three"), ['one two', 'three'])
  assert.deepEqual(splitArgs('   '), [])
})
