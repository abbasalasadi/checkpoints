/**
 * Diagnosis tests.
 *
 * These outcomes are exactly the ones the output cannot explain: a program stopped at the time
 * limit, one stopped for flooding stdout, and one that never started all simply produce a terminal
 * that stops. If the wording regresses the student is left with a truncated log and no idea which
 * happened — so the wording is pinned here rather than left to a component.
 */
import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { diagnose } from '../src/lib/diagnostics/js.js';

const LIMITS = { timeoutSeconds: 60, outputLimitBytes: 256 * 1024 };

describe('diagnose — outcomes the output cannot explain', () => {
  test('a timeout names the server’s limit and points at loops', () => {
    const d = diagnose('run', 'timeout', '', LIMITS);
    assert.equal(d.tone, 'warn');
    assert.match(d.hint!, /60 seconds/);
    assert.match(d.hint!, /stopped/i);
    // The actionable half: a warning that only reports the symptom leaves the student exactly as
    // stuck as they were.
    assert.match(d.hint!, /loop|recursion/i);
  });

  test('the timeout wording follows the configured limit rather than a hardcoded one', () => {
    assert.match(diagnose('run', 'timeout', '', { timeoutSeconds: 30 }).hint!, /30 seconds/);
    // With no limit to hand it says nothing about seconds — better than naming a wrong number.
    assert.doesNotMatch(diagnose('run', 'timeout', '').hint!, /seconds/);
  });

  test('flooded output says it was stopped for printing, and names the cap', () => {
    const d = diagnose('run', 'output_limit', 'x'.repeat(1000), LIMITS);
    assert.equal(d.tone, 'warn');
    assert.match(d.title, /printed too much/i);
    assert.match(d.hint!, /256 KB/);
    assert.match(d.hint!, /console\.log/);
  });

  test('an out-of-memory kill blames allocation, not the platform', () => {
    const d = diagnose('submit', 'oom', '', LIMITS);
    assert.match(d.title, /memory/i);
    assert.match(d.hint!, /allocat/i);
  });

  test('a runner failure says the code never ran', () => {
    const d = diagnose('submit', 'error', '', LIMITS);
    assert.equal(d.tone, 'error');
    assert.match(d.hint!, /never ran/);
  });

  test('a cancelled run is attributed to the student, not reported as a failure', () => {
    const d = diagnose('run', 'cancelled', '', LIMITS);
    assert.equal(d.tone, 'warn');
    assert.match(d.hint!, /You stopped/);
  });
});

describe('diagnose — a pass', () => {
  test('Submit passing is the whole message', () => {
    assert.deepEqual(diagnose('submit', 'passed', 'ok', LIMITS), { title: 'Passed', tone: 'ok' });
  });

  test('a run that prints nothing points at main.js', () => {
    const d = diagnose('run', 'passed', '  \n', LIMITS);
    assert.match(d.title, /printed nothing/i);
    assert.match(d.hint!, /main\.js/);
  });
});

describe('diagnose — failures the output does explain', () => {
  test('the harness’s name collision is named, with the offending identifier', () => {
    const d = diagnose('submit', 'failed', "SyntaxError: Identifier 'factorial' has already been declared", LIMITS);
    assert.match(d.title, /factorial/);
    assert.match(d.hint!, /Rename/);
  });

  test('a banned import explains the file is a plain script', () => {
    assert.match(diagnose('submit', 'failed', 'import keyword not allowed', LIMITS).title, /import/);
  });

  test('process.exit is called out rather than left as a bare exit code', () => {
    const d = diagnose('submit', 'failed', 'process.exit(0) is not allowed', LIMITS);
    assert.match(d.title, /process\.exit/);
  });

  test('a missing global names what the test calls', () => {
    const d = diagnose('submit', 'failed', 'ReferenceError: factorial is not defined', LIMITS);
    assert.match(d.title, /factorial is not defined/);
    assert.match(d.hint!, /top level/);
  });

  test('infinite recursion is distinguished from an infinite loop', () => {
    const d = diagnose('submit', 'failed', 'RangeError: Maximum call stack size exceeded', LIMITS);
    assert.match(d.title, /recursion/i);
  });

  test('ANSI colour in the output does not defeat the patterns', () => {
    const d = diagnose('submit', 'failed', '\x1b[31mReferenceError: factorial is not defined\x1b[0m', LIMITS);
    assert.match(d.title, /factorial is not defined/);
  });

  test('an unrecognised failure still says which side it was on', () => {
    assert.equal(diagnose('submit', 'failed', 'something new', LIMITS).title, 'Failed');
    assert.equal(diagnose('run', 'failed', 'something new', LIMITS).title, 'Finished with an error');
  });
});
