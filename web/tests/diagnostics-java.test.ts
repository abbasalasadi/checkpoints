import { describe, expect, it } from 'vitest';
import { parseAssertion } from '../src/lib/assertion.js';
import { diagnoseRun } from '../src/lib/diagnostics/index.js';

// Shapes copied from the official module-java harness (TestRunnerMain) and javac/Maven.
const ASSERTJ = `Failures:
  1) lengthOfEmptyString() -> org.opentest4j.AssertionFailedError: 
expected: 0
 but was: -1
org.opentest4j.AssertionFailedError: 
expected: 0
 but was: -1
\tat java.base/jdk.internal.reflect.X.newInstance(X.java:62)
[         1 tests failed          ]`;
const JUNIT = `  1) adds() -> org.opentest4j.AssertionFailedError: sum ==> expected: <5> but was: <4>`;
const MVN = `[ERROR] COMPILATION ERROR : 
[ERROR] /tmp/work/project/src/main/java/ExerciseRunner.java:[3,46] integer number too large`;
const JAVAC = `./ExerciseRunner.java:3: error: illegal start of expression\n1 error`;

describe('java diagnostics', () => {
  it('reads AssertJ expected / but was', () => {
    expect(parseAssertion('java', ASSERTJ)).toEqual({ label: 'lengthOfEmptyString', expected: '0', actual: '-1' });
  });
  it('reads JUnit assertEquals', () => {
    expect(parseAssertion('java', JUNIT)).toEqual({ label: 'adds', expected: '5', actual: '4' });
  });
  it('names failed tests', () => {
    const d = diagnoseRun('java', 'test', { exitCode: 1, output: ASSERTJ });
    expect(d.title).toBe('1 test failed');
    expect(d.hint).toBe('First failure: lengthOfEmptyString');
  });
  it('names the first compile error from Maven and javac', () => {
    expect(diagnoseRun('java', 'test', { exitCode: 1, output: MVN }).hint).toBe('ExerciseRunner.java:3: integer number too large');
    expect(diagnoseRun('java', 'run', { exitCode: 1, output: JAVAC }).title).toBe('Does not compile');
  });
  it('passes and stops', () => {
    expect(diagnoseRun('java', 'test', { exitCode: 0, output: '' }).tone).toBe('ok');
    expect(diagnoseRun('java', 'run', { outcome: 'timeout', exitCode: null, output: '' }).title).toBe('Timed out');
  });
});
