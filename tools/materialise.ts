/**
 * Phase 03, step 2 — materialise content/ from var/index.json.
 *
 * Writes one canonical directory per exercise.
 *
 * HISTORICAL. This ran once, against the Checkpoint_* tree that has since been
 * deleted, and `content/` is now the source of truth rather than an output.
 * Kept as the record of how content/ was derived. It cannot run destructively
 * by accident: inventory.ts asserts 40 exercises and 77 placements and exits
 * non-zero when the source tree is absent, so `make content` stops at step 1.
 *
 * Per exercise:
 *   meta.json    slug, kind, editions, argv, test shape, deps, placements
 *   README.md    canonical statement (filename bug fixed on the way through)
 *   starter.rs   the stub a student receives
 *   solution.rs  reference answer, commented-out alternatives stripped
 *   main.rs      demo harness
 *   test.rs      test file, byte-for-byte
 *
 *   make content-materialise
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterFromReadme } from './lib/rust-source.js';

const ROOT = process.cwd();
const INDEX = join(ROOT, 'var', 'index.json');
const OUT = join(ROOT, 'content', 'rust');
if (!existsSync(INDEX)) {
  console.error('  var/index.json not found — run `make content-inventory` first');
  process.exit(1);
}

interface IndexExercise {
  slug: string;
  kind: 'lib' | 'bin';
  edition: string;
  testEdition: string;
  argv: boolean;
  testShape: 'lib' | 'main';
  deps: { name: string; version: string }[];
  canonicalFrom: string;
  files: { readme: string | null; lib: string | null; main: string | null; test: string };
  gaps: { noReadme: boolean; readmeFilenameBug: boolean; noSignatureBlock: boolean };
}

interface Index {
  exercises: IndexExercise[];
  placements: { exercise: string; checkpoint: string; level: number }[];
}

const index = JSON.parse(readFileSync(INDEX, 'utf8')) as Index;

/**
 * Strip leading commented-out alternative solutions.
 *
 * 27 of the lib.rs files carry a previous attempt commented out above the live
 * code. Only a *leading* run of comment/blank lines is removed, so explanatory
 * comments inside the implementation survive.
 */
function stripLeadingCommentBlock(src: string): string {
  const lines = src.split('\n');
  let i = 0;
  while (i < lines.length) {
    const t = (lines[i] ?? '').trim();
    if (t === '' || t.startsWith('//')) i += 1;
    else break;
  }
  // Only treat it as a dead-code block if it actually contained code.
  const head = lines.slice(0, i).join('\n');
  if (!/\/\/\s*(pub\s+)?(fn|use|struct|enum|impl)\b/.test(head)) return src.trimEnd() + '\n';
  return lines.slice(i).join('\n').trimEnd() + '\n';
}

/**
 * Derive the student's starting point — from the README only.
 *
 * Never from the solution: even with bodies stubbed, a solution's signatures,
 * types and helpers are answers the checkpoint withholds. See starterFromReadme.
 */
function deriveStarter(ex: IndexExercise, readme: string | null): { src: string; from: 'readme' | 'todo' } {
  if (readme === null) {
    return { src: '// TODO: hand-written stub required — no README to derive from.\n', from: 'todo' };
  }
  return { src: starterFromReadme(readme, ex.slug, ex.kind), from: 'readme' };
}

/**
 * Validate the whole input BEFORE destroying anything.
 *
 * This tool wipes content/exercises and rebuilds it. An earlier version wiped
 * first and read afterwards, so running it against a stale or empty index —
 * one left behind by a failed inventory — deleted all 40 exercises and wrote
 * nothing back. Destructive steps must come last, after the inputs are known
 * good.
 */
if (index.exercises.length === 0) {
  console.error(
    '\n  Refusing to run: var/index.json lists no exercises.\n' +
      '  content/exercises would be wiped and nothing written back.\n' +
      '  Run `make content-inventory` against the source tree first.\n',
  );
  process.exit(1);
}

const unreadable = index.exercises.filter((ex) => !existsSync(join(ROOT, ex.files.test)));
if (unreadable.length > 0) {
  console.error(
    `\n  Refusing to run: ${unreadable.length} of ${index.exercises.length} source files are missing,\n` +
      `  starting with ${unreadable[0]?.files.test}.\n` +
      '  The index points at a tree that is no longer there.\n',
  );
  process.exit(1);
}

if (existsSync(join(OUT, 'exercises'))) rmSync(join(OUT, 'exercises'), { recursive: true });
mkdirSync(join(OUT, 'exercises'), { recursive: true });

const placementsBySlug = new Map<string, { checkpoint: string; level: number }[]>();
for (const p of index.placements) {
  const list = placementsBySlug.get(p.exercise) ?? [];
  list.push({ checkpoint: p.checkpoint, level: p.level });
  placementsBySlug.set(p.exercise, list);
}

let written = 0;
const handAuthored: string[] = [];

for (const ex of index.exercises) {
  const dir = join(OUT, 'exercises', ex.slug);
  mkdirSync(dir, { recursive: true });

  const readme = ex.files.readme ? readFileSync(join(ROOT, ex.files.readme), 'utf8') : null;
  const libSrc = ex.files.lib ? readFileSync(join(ROOT, ex.files.lib), 'utf8') : null;
  const mainSrc = ex.files.main ? readFileSync(join(ROOT, ex.files.main), 'utf8') : null;
  const testSrc = readFileSync(join(ROOT, ex.files.test), 'utf8');

  // The solution is whichever file holds the implementation.
  const solution = ex.kind === 'lib' ? (libSrc ?? '') : (mainSrc ?? '');
  const cleanSolution = stripLeadingCommentBlock(solution);

  // README: always written as README.md — this is where the filename bug dies.
  if (readme !== null) {
    writeFileSync(join(dir, 'README.md'), readme);
  } else {
    writeFileSync(
      join(dir, 'README.md'),
      `# ${ex.slug}\n\n> TODO: instructions required. This exercise has no upstream README.\n` +
        `> See docs/03-content-pipeline.md.\n`,
    );
    handAuthored.push(`${ex.slug} (README)`);
  }

  writeFileSync(join(dir, 'solution.rs'), cleanSolution);
  writeFileSync(join(dir, 'test.rs'), testSrc);

  // main.rs is the demo harness. bin-only exercises keep their main as the
  // solution, so the harness is the same file.
  writeFileSync(join(dir, 'main.rs'), mainSrc ?? '');

  const starter = deriveStarter(ex, readme);
  writeFileSync(join(dir, 'starter.rs'), starter.src);
  if (starter.from === 'todo') handAuthored.push(`${ex.slug} (starter)`);

  writeFileSync(
    join(dir, 'meta.json'),
    `${JSON.stringify(
      {
        slug: ex.slug,
        kind: ex.kind,
        edition: ex.edition,
        testEdition: ex.testEdition,
        argv: ex.argv,
        testShape: ex.testShape,
        deps: ex.deps,
        starterFrom: starter.from,
        placements: placementsBySlug.get(ex.slug) ?? [],
        sourcedFrom: ex.canonicalFrom,
      },
      null,
      2,
    )}\n`,
  );
  written += 1;
}

writeFileSync(
  join(OUT, 'index.json'),
  `${JSON.stringify(
    {
      exercises: index.exercises.map((e) => ({
        slug: e.slug,
        kind: e.kind,
        edition: e.edition,
        testEdition: e.testEdition,
        argv: e.argv,
        testShape: e.testShape,
        deps: e.deps,
      })),
      placements: index.placements,
    },
    null,
    2,
  )}\n`,
);

console.log(`
  Materialised content/

  exercises written    ${written}
  index                content/index.json (${index.placements.length} placements)

  Needs hand-authoring (${handAuthored.length}):
${handAuthored.map((h) => `    - ${h}`).join('\n') || '    none'}
`);
