/**
 * V3 step 7a — Java content importer (docs/01_design/07_java_track.md §3).
 *
 * Reads the exported official tester image and the 01-edu subjects zip, and
 * writes content/java/: README (verbatim), official test (verbatim), shared
 * harness (verbatim), ExerciseRunner.java (the subject's usage block), meta,
 * index and provenance. Starters and solutions are written by hand (step 7b)
 * because the subjects' code blocks are pseudo-code; this tool never touches
 * them. Idempotent: re-running rewrites the same bytes.
 *
 *   node --experimental-strip-types tools/java-content.ts [--image DIR] [--zip FILE]
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BACKUP = '/media/abbas/Data D/00. Backup/Reboot/Master-Repos';
const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1]! : fallback;
};
const IMAGE = arg('--image', join(BACKUP, 'Checkpoints/module-java-docker'));
const ZIP = arg('--zip', join(BACKUP, 'public-master.zip'));
const OUT = join(ROOT, 'content', 'java');
const SUBJECTS = 'public/subjects/java/checkpoints';

/** The owner's list (2026-11-04, D30): checkpoint → level → slugs, in the given order. */
const PLACEMENTS: Record<string, string[][]> = {
  '1': [
    ['goodbye-mars', 'system-logger', 'universal-greeting', 'average-calc'],
    ['multiplication-table', 'unit-converter'],
    ['strlen', 'count-char', 'digitlen'],
    ['rotate-array', 'reverse-array', 'sort-array'],
    ['almost-palindrom', 'factorial', 'next-prime'],
  ],
  '2': [
    ['todo-list', 'time-tracker', 'date-formatter'],
    ['area-calculator', 'factorial-master', 'flexisort'],
    ['double-linked-list', 'circular-linked-list', 'single-linked-list'],
    ['harmonious-fusion', 'distinct-substring-length', 'is-anagram'],
    ['spiral-matrix', 'maximal-square', 'steady-sequence'],
  ],
  '3': [
    ['day-of-week', 'monthly-period', 'age-finder'],
    ['html-validator', 'breakdown-url', 'config-protector'],
    ['singleton-blueprint', 'builder-blueprint', 'factory-blueprint'],
    ['top-frequents', 'longest-common-prefix', 'first-unique'],
    ['valid-sudoku', 'armstrong-number', 'perfect-number'],
  ],
};

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');
const write = (path: string, data: string | Buffer) => {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, data);
};
const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const unzip = (path: string) => execFileSync('unzip', ['-p', ZIP, path], { maxBuffer: 1 << 24 });

const testsDir = join(IMAGE, 'app', 'tests');
const testDirs = readdirSync(testsDir).filter((d) => d.endsWith('_test'));
/** Test class of a slug: the image's directory, matched without dashes/case (almost-palindrom → AlmostPalindrome). */
function classFor(slug: string): string {
  const key = slug.replace(/-/g, '');
  const hits = testDirs.map((d) => d.slice(0, -5)).filter((c) => c.toLowerCase() === key || c.toLowerCase() === key + 'e');
  if (hits.length !== 1) throw new Error(`${slug}: ${hits.length} test classes match (${hits.join(', ')})`);
  return hits[0]!;
}

/** Java code blocks of a README, in order. */
// Some subjects open a block with four backticks and nest a ```java line inside; a block ends at a bare fence.
const javaBlocks = (md: string) => [...md.matchAll(/^`{3,}java\n([\s\S]*?)^`{3,}\s*$/gm)].map((m) => m[1]!);
/** Public top-level types named in the expected block (enum/class/interface/record, public or not). */
function typesIn(block: string): string[] {
  const names = [...block.matchAll(/^(?:public\s+)?(?:abstract\s+|final\s+)*(?:class|interface|enum|record)\s+([A-Z]\w*)/gm)].map((m) => m[1]!);
  return [...new Set(names)];
}

/** Types the subject writes as pseudo-code the parser cannot see (checked by hand against the test). */
const EXTRA_TYPES: Record<string, string[]> = {
  'builder-blueprint': ['RegexBuilder'], // "public ... RegexBuilder {"
};

const exercises: unknown[] = [];
const placements: unknown[] = [];
const provenance: Record<string, string> = {};
const review: string[] = [];

for (const [checkpoint, levels] of Object.entries(PLACEMENTS)) {
  levels.forEach((slugs, li) => {
    slugs.forEach((slug, index) => {
      placements.push({ exercise: slug, checkpoint, level: li + 1, index, order: index, category: li === 4 ? 'optional' : 'required' });
    });
  });
}
const allSlugs = Object.values(PLACEMENTS).flat(2);
if (allSlugs.length !== 45 || new Set(allSlugs).size !== 45) throw new Error('expected 45 distinct exercises');

for (const slug of allSlugs) {
  const cls = classFor(slug);
  const dir = join(OUT, 'exercises', slug);
  const readme = unzip(`${SUBJECTS}/${slug}/README.md`);
  const md = readme.toString('utf8');
  write(join(dir, 'README.md'), readme);

  const testSrc = join(testsDir, `${cls}_test`);
  const testFiles = readdirSync(testSrc).sort();
  for (const f of testFiles) {
    mkdirSync(join(dir, 'test'), { recursive: true });
    copyFileSync(join(testSrc, f), join(dir, 'test', f));
    provenance[`tests/${cls}_test/${f}`] = sha(readFileSync(join(testSrc, f)));
  }

  const blocks = javaBlocks(md);
  const runner = [...blocks].reverse().find((b) => /class\s+ExerciseRunner\b/.test(b));
  if (runner) write(join(dir, 'ExerciseRunner.java'), runner);
  else review.push(`${slug}: no ExerciseRunner block`);

  const types = [...typesIn(blocks.filter((b) => b !== runner).join('\n')), ...(EXTRA_TYPES[slug] ?? [])];
  if (types.length === 0) review.push(`${slug}: no types found in the expected block`);
  if (types.length > 1) review.push(`${slug}: ${types.length} types (${types.join(', ')}) — check expectedFiles`);
  const expectedFiles = (types.length ? types : [cls]).map((t) => `${t}.java`);

  const title = /^##\s+(.+)$/m.exec(md)?.[1]?.trim() ?? slug;
  const meta = {
    slug,
    title,
    language: 'java',
    status: 'placed',
    kind: 'class',
    argv: false,
    expectedFiles,
    editorFiles: [...expectedFiles, 'ExerciseRunner.java'],
    files: { subject: 'README.md', starter: expectedFiles, main: 'ExerciseRunner.java', solution: 'solution/', test: 'test/' },
    subject: { repo: '01-edu/public', path: `subjects/java/checkpoints/${slug}/README.md`, sha256: sha(readme) },
    test: { image: 'module-java', path: `/app/tests/${cls}_test`, className: cls, files: testFiles },
    placements: placements.filter((p: any) => p.exercise === slug).map(({ exercise: _e, ...p }: any) => p),
  };
  write(join(dir, 'meta.json'), json(meta));
  exercises.push({ slug, language: 'java', kind: 'class', argv: false, dir: `exercises/${slug}`, title, className: cls });
}

const harness = join(OUT, 'sources', 'harness');
for (const [from, to] of [
  ['app/tests/TestRunnerMain.java', 'TestRunnerMain.java'],
  ['app/tests/StopAfterFailureExtension.java', 'StopAfterFailureExtension.java'],
  ['app/pom.xml', 'pom.xml'],
  ['app/entrypoint.sh', 'entrypoint.sh'],
] as const) {
  const buf = readFileSync(join(IMAGE, from));
  write(join(harness, to), buf);
  provenance[from] = sha(buf);
}

const release = readFileSync(join(IMAGE, 'opt/java/openjdk/release'), 'utf8');
write(
  join(OUT, 'sources', 'module-java-image.json'),
  json({
    source: 'exported filesystem of the official module-java tester image',
    jdk: /JAVA_RUNTIME_VERSION="([^"]+)"/.exec(release)?.[1] ?? null,
    implementor: /IMPLEMENTOR_VERSION="([^"]+)"/.exec(release)?.[1] ?? null,
    mavenRepo: 'app/tests_utility (offline; copied into the runner image at build time, not into content/)',
    sha256: provenance,
  }),
);
write(join(OUT, 'sources', 'placements.json'), json({ source: 'owner, 2026-11-04 (D30)', checkpoints: PLACEMENTS }));
write(
  join(OUT, 'index.json'),
  json({
    schema: 1,
    language: 'java',
    meta: {
      description: 'Canonical content for the Java checkpoint tester: one directory per exercise.',
      levelModel: 'level belongs to the placement, not the exercise',
      subjects: { repo: '01-edu/public', zip: 'public-master.zip' },
      tests: { image: 'module-java', archive: 'app/tests' },
      placementSource: { file: 'content/java/sources/placements.json' },
    },
    exercises,
    placements,
  }),
);

console.log(`java content: ${exercises.length} exercises, ${placements.length} placements`);
if (review.length) console.log('review:\n  ' + review.join('\n  '));
