/**
 * Problems worth mentioning before Submit is pressed.
 *
 * These are the failures that look least like the student's fault, because the code they wrote
 * looks fine and Run may even succeed:
 *
 *   - a name the test file also declares. The harness concatenates the two into one module, so it
 *     is a SyntaxError before a single test runs. Four of the thirty solutions this project started
 *     from died this way.
 *   - `import`. Node 24 detects ESM syntax in a .js file, so **Run works**; the harness rejects it
 *     outright, so Submit does not.
 *   - `process.exit`. The harness forbids it; a plain Run does not care.
 *
 * Advisory only. The server is the authority on all three, and this is a regex over source — it
 * does not parse. It warns, it never blocks.
 */

export interface Warning {
  code: 'collision' | 'import' | 'process-exit';
  message: string;
}

/** Top-level declarations only: indentation means nested, and nested names never collide. */
const topLevelDecls = (code: string): string[] => [
  ...new Set(
    [...code.matchAll(/^(?:export\s+)?(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(
      (m) => m[1] as string,
    ),
  ),
];

/** Strip comments and strings so a word inside either is not mistaken for code. */
const stripped = (code: string): string =>
  code
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/(['"`])(?:\\.|(?!\1)[^\\])*\1/g, "''");

export function lintForSubmit(code: string, reservedNames: string[]): Warning[] {
  const source = stripped(code);
  const warnings: Warning[] = [];

  const clashes = topLevelDecls(source).filter((name) => reservedNames.includes(name));
  if (clashes.length > 0) {
    const names = clashes.map((n) => `\`${n}\``).join(', ');
    warnings.push({
      code: 'collision',
      message:
        `Your file defines ${names}, which the test also defines. Submit will fail with a syntax ` +
        'error before any test runs — rename it, or move it inside your function.',
    });
  }

  if (/^\s*import\s.+from\s|^\s*import\s*['"]/m.test(source)) {
    warnings.push({
      code: 'import',
      message: 'Run allows `import`, but Submit does not. Remove it before submitting.',
    });
  }

  if (/\bprocess\s*\.\s*exit\s*\(/.test(source)) {
    warnings.push({
      code: 'process-exit',
      message: 'Submit rejects `process.exit`. Return your value instead of exiting.',
    });
  }

  return warnings;
}
