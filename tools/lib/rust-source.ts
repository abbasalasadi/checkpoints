/**
 * Rust source transforms shared by the content tools.
 *
 * Kept free of side effects on purpose: verify.ts imports from here, and an
 * importable module that rewrites content/ on load would silently re-materialise
 * the tree it is meant to be checking.
 */

/**
 * Derive the student's starter from the README alone.
 *
 * The starter must never be derived from solution.rs: even with bodies
 * replaced, a solution's signatures, types, fields, helpers and `use` lines
 * are answers the checkpoint deliberately withholds (prime_checker's
 * `/* Implement return type here *\/`, own_and_return's parameters). So the
 * starter is the README's expected-code blocks verbatim, placeholders and
 * all, even when that does not compile — filling the gap is the exercise.
 *
 * A block counts as expected code when it declares an item and is not the
 * usage program (`use <crate>::` of the exercise itself, or — for a lib —
 * `fn main`). The only edit made is an empty fn body `{}` becoming todo!().
 */
export function starterFromReadme(readme: string, slug: string, kind: 'lib' | 'bin'): string {
  const blocks = [...readme.matchAll(/^```(?:rust|rs)[ \t]*\n([\s\S]*?)^```/gm)].map((m) => m[1] ?? '');
  const usage = new RegExp(`^\\s*(pub\\s+)?use\\s+${slug}\\b`, 'm');
  const expected = blocks.filter(
    (b) =>
      /^\s*(#\[|pub\b|fn\b|struct\b|enum\b|impl\b|trait\b|type\b|mod\b|use\b)/m.test(b) &&
      !(kind === 'lib' && /\bfn\s+main\s*\(/.test(b)) &&
      !usage.test(b),
  );

  if (expected.length > 0) {
    const src = expected.map((b) => b.trim()).join('\n\n');
    return `${src.replace(/(\bfn\s[^{};]*)\{\s*\}/g, '$1{\n    todo!()\n}')}\n`;
  }
  if (kind === 'bin') return 'fn main() {\n    todo!()\n}\n';
  return '// The instructions describe what to write here.\n';
}
