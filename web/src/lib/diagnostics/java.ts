/**
 * Java diagnostics (V3 step 7e): reads javac / Maven / JUnit output from the
 * official module-java entrypoint and names what went wrong in one line.
 */
import type { Tone } from './index.js';

export interface JavaDiagnosis {
  title: string;
  hint?: string;
  tone: Tone;
}

/** The first javac error as "File.java:line: message", whether javac or Maven printed it. */
export function firstCompileError(out: string): string | null {
  const javac = /^(?:\.\/)?([\w$]+\.java):(\d+): error: (.+)$/m.exec(out);
  if (javac) return `${javac[1]}:${javac[2]}: ${javac[3]}`;
  const mvn = /^\[ERROR\] \S*?([\w$]+\.java):\[(\d+),\d+\] (.+)$/m.exec(out);
  return mvn ? `${mvn[1]}:${mvn[2]}: ${mvn[3]}` : null;
}

export function diagnose(kind: 'run' | 'test', passed: boolean, out: string): JavaDiagnosis {
  if (passed) return kind === 'test' ? { title: 'All tests passed', tone: 'ok' } : { title: 'Ran successfully', tone: 'ok' };
  const compile = firstCompileError(out);
  if (compile || /COMPILATION ERROR|cannot find symbol/.test(out)) {
    return { title: 'Does not compile', hint: compile ?? 'Fix the compiler errors shown below.', tone: 'error' };
  }
  if (kind === 'test') {
    const failed = /\[\s*(\d+) tests failed\s*\]/.exec(out)?.[1];
    const name = /^\s*1\) (\S+?)\(\) ->/m.exec(out)?.[1];
    return {
      title: failed && failed !== '0' ? `${failed} test${failed === '1' ? '' : 's'} failed` : 'Tests failed',
      hint: name ? `First failure: ${name}` : undefined,
      tone: 'error',
    };
  }
  const exc = /Exception in thread "main" ([\w.$]+)(?::\s*(.*))?/.exec(out);
  if (exc) return { title: `Crashed: ${exc[1]!.split('.').pop()}`, hint: exc[2] || undefined, tone: 'error' };
  return { title: 'Exited with an error', tone: 'error' };
}
