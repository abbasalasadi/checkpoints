/**
 * Phase 03, step 1 — inventory. READ-ONLY with respect to the exercise tree.
 *
 * Walks the Checkpoint / Level / exercise tree and builds an index describing every
 * exercise and every placement. Writes var/index.json for review; nothing that
 * already exists is touched.
 *
 * It also asserts the facts the plan is built on (40 exercises, 77 placements,
 * 40 unique test hashes). If the tree disagrees with the plan, this fails loudly
 * rather than quietly producing a wrong index — the whole restructure depends on
 * these numbers.
 *
 *   make content-inventory
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

const ROOT = process.cwd();
const OUT = join(ROOT, 'var', 'index.json');

// ── expectations from docs/A1-repo-inventory.md ──────────────────────────────
const EXPECT = {
  exercises: 40,
  placements: 77,
  uniqueTestHashes: 40,
  perCheckpoint: { Checkpoint_1: 10, Checkpoint_2: 15, Checkpoint_3: 22, Checkpoint_final: 30 },
} as const;

type TestShape = 'lib' | 'main';
type Kind = 'lib' | 'bin';

interface Dep {
  name: string;
  version: string;
}

interface Placement {
  exercise: string;
  checkpoint: string;
  level: number;
  dir: string;
}

interface Exercise {
  slug: string;
  kind: Kind;
  edition: string;
  /** The test crate's own edition — four of them are 2021 while the exercise is 2024. */
  testEdition: string;
  argv: boolean;
  testShape: TestShape;
  deps: Dep[];
  hasReadme: boolean;
  readmeFilenameBug: boolean;
  hasSignatureBlock: boolean;
  canonicalFrom: string;
  files: { readme: string | null; lib: string | null; main: string | null; test: string };
}

const problems: string[] = [];
const notes: string[] = [];

function fail(msg: string) {
  problems.push(msg);
}

function readIfExists(p: string): string | null {
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

function sha(content: string): string {
  return createHash('sha256').update(content).digest('hex').slice(0, 12);
}

function dirs(p: string): string[] {
  if (!existsSync(p)) return [];
  return readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory());
}

/**
 * README lookup must tolerate the filename bug: four files are named
 * "README .md" with a space before the extension. Globbing README.md silently
 * misses them, which is exactly how an earlier count was wrong.
 */
function findReadme(dir: string): { path: string; bug: boolean } | null {
  if (!existsSync(dir)) return null;
  for (const f of readdirSync(dir)) {
    if (f === 'README.md') return { path: join(dir, f), bug: false };
  }
  for (const f of readdirSync(dir)) {
    if (/^README\s*\.md$/i.test(f)) return { path: join(dir, f), bug: true };
  }
  return null;
}

function parseEdition(cargoToml: string | null): string {
  const m = cargoToml?.match(/^\s*edition\s*=\s*"([^"]+)"/m);
  return m?.[1] ?? '2024';
}

/** Non-path dependencies only — path deps are derivable and regenerated. */
function parseDeps(cargoToml: string | null): Dep[] {
  if (!cargoToml) return [];
  const section = cargoToml.split(/^\[dependencies\]\s*$/m)[1];
  if (!section) return [];
  const body = section.split(/^\[/m)[0] ?? '';
  const out: Dep[] = [];
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    if (t.includes('path')) continue;
    const m = t.match(/^([A-Za-z0-9_-]+)\s*=\s*"([^"]+)"/);
    if (m?.[1] && m[2]) out.push({ name: m[1], version: m[2] });
  }
  return out;
}

// ── walk the tree ────────────────────────────────────────────────────────────

const placements: Placement[] = [];
const bySlug = new Map<string, Placement[]>();

for (const cp of readdirSync(ROOT).filter((d) => /^Checkpoint_/.test(d)).sort()) {
  for (const level of dirs(join(ROOT, cp)).sort()) {
    const levelNum = Number.parseInt(level.replace(/^Level_/, ''), 10);
    for (const ex of dirs(join(ROOT, cp, level)).sort()) {
      if (ex.endsWith('_test')) continue;
      const p: Placement = {
        exercise: ex,
        checkpoint: cp.replace(/^Checkpoint_/, ''),
        level: levelNum,
        dir: relative(ROOT, join(ROOT, cp, level, ex)),
      };
      placements.push(p);
      const list = bySlug.get(ex) ?? [];
      list.push(p);
      bySlug.set(ex, list);
    }
  }
}

// ── build one record per exercise, preferring the latest checkpoint ──────────

const ORDER = ['1', '2', '3', 'final'];
const exercises: Exercise[] = [];
const testHashes = new Map<string, string>();

for (const [slug, places] of [...bySlug.entries()].sort()) {
  const canonical =
    [...places].sort((a, b) => ORDER.indexOf(b.checkpoint) - ORDER.indexOf(a.checkpoint))[0]!;
  const exDir = join(ROOT, canonical.dir);
  const testDir = `${exDir}_test`;

  if (!existsSync(testDir)) {
    fail(`${slug}: no test crate beside the canonical copy (${canonical.dir}_test)`);
    continue;
  }

  const libSrc = readIfExists(join(exDir, 'src', 'lib.rs'));
  const mainSrc = readIfExists(join(exDir, 'src', 'main.rs'));
  const kind: Kind = libSrc !== null ? 'lib' : 'bin';

  const testLib = readIfExists(join(testDir, 'src', 'lib.rs'));
  const testMain = readIfExists(join(testDir, 'src', 'main.rs'));
  const testShape: TestShape = testLib !== null ? 'lib' : 'main';
  const testSrc = testLib ?? testMain;
  if (testSrc === null) {
    fail(`${slug}: test crate has neither src/lib.rs nor src/main.rs`);
    continue;
  }
  testHashes.set(slug, sha(testSrc));

  const readme = findReadme(exDir);
  const readmeText = readme ? readFileSync(readme.path, 'utf8') : null;

  // Divergence check: identical content across placements is what makes
  // deduplication safe. Report rather than silently picking one.
  for (const other of places) {
    if (other.dir === canonical.dir) continue;
    const otherTestDir = join(ROOT, `${other.dir}_test`);
    const otherTest =
      readIfExists(join(otherTestDir, 'src', 'lib.rs')) ??
      readIfExists(join(otherTestDir, 'src', 'main.rs'));
    if (otherTest !== null && sha(otherTest) !== sha(testSrc)) {
      fail(`${slug}: test crate DIFFERS between ${canonical.dir} and ${other.dir}`);
    }
    const otherSolution =
      readIfExists(join(ROOT, other.dir, 'src', 'lib.rs')) ??
      readIfExists(join(ROOT, other.dir, 'src', 'main.rs'));
    const canonSolution = libSrc ?? mainSrc;
    if (otherSolution !== null && canonSolution !== null && otherSolution !== canonSolution) {
      notes.push(
        `${slug}: solution differs between ${canonical.dir} and ${other.dir} — ` +
          'taking the later checkpoint; the acceptance gate proves it passes',
      );
    }
  }

  exercises.push({
    slug,
    kind,
    edition: parseEdition(readIfExists(join(exDir, 'Cargo.toml'))),
    testEdition: parseEdition(readIfExists(join(testDir, 'Cargo.toml'))),
    argv: /std::env::args|env::args/.test(mainSrc ?? ''),
    testShape,
    deps: parseDeps(readIfExists(join(testDir, 'Cargo.toml'))),
    hasReadme: readme !== null,
    readmeFilenameBug: readme?.bug ?? false,
    hasSignatureBlock: /```rust/.test(readmeText ?? ''),
    canonicalFrom: canonical.dir,
    files: {
      readme: readme ? relative(ROOT, readme.path) : null,
      lib: libSrc !== null ? relative(ROOT, join(exDir, 'src', 'lib.rs')) : null,
      main: mainSrc !== null ? relative(ROOT, join(exDir, 'src', 'main.rs')) : null,
      test: relative(ROOT, join(testDir, 'src', testShape === 'lib' ? 'lib.rs' : 'main.rs')),
    },
  });
}

// ── assert the plan's numbers ────────────────────────────────────────────────

if (exercises.length !== EXPECT.exercises)
  fail(`expected ${EXPECT.exercises} exercises, found ${exercises.length}`);
if (placements.length !== EXPECT.placements)
  fail(`expected ${EXPECT.placements} placements, found ${placements.length}`);

const uniqueTests = new Set(testHashes.values()).size;
if (uniqueTests !== EXPECT.uniqueTestHashes)
  fail(`expected ${EXPECT.uniqueTestHashes} unique test hashes, found ${uniqueTests}`);

for (const [cp, n] of Object.entries(EXPECT.perCheckpoint)) {
  const key = cp.replace(/^Checkpoint_/, '');
  const actual = placements.filter((p) => p.checkpoint === key).length;
  if (actual !== n) fail(`${cp}: expected ${n} placements, found ${actual}`);
}

// ── report ───────────────────────────────────────────────────────────────────

const index = {
  generatedFrom: 'Checkpoint_*/Level_*',
  exercises: exercises.map((e) => ({
    slug: e.slug,
    kind: e.kind,
    edition: e.edition,
    testEdition: e.testEdition,
    argv: e.argv,
    testShape: e.testShape,
    deps: e.deps,
    canonicalFrom: e.canonicalFrom,
    files: e.files,
    gaps: {
      noReadme: !e.hasReadme,
      readmeFilenameBug: e.readmeFilenameBug,
      noSignatureBlock: e.hasReadme && !e.hasSignatureBlock,
    },
  })),
  placements: placements.map((p) => ({
    exercise: p.exercise,
    checkpoint: p.checkpoint,
    level: p.level,
  })),
};

mkdirSync(join(ROOT, 'var'), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(index, null, 2)}\n`);

const noReadme = exercises.filter((e) => !e.hasReadme).map((e) => e.slug);
const bugged = exercises.filter((e) => e.readmeFilenameBug).map((e) => e.slug);
const noSig = exercises.filter((e) => e.hasReadme && !e.hasSignatureBlock).map((e) => e.slug);
const withDeps = exercises.filter((e) => e.deps.length > 0);
const binOnly = exercises.filter((e) => e.kind === 'bin').map((e) => e.slug);
const argvEx = exercises.filter((e) => e.argv).map((e) => e.slug);

console.log(`
  Inventory — read-only, wrote ${relative(ROOT, OUT)}

  exercises            ${exercises.length}
  placements           ${placements.length}
  unique test hashes   ${uniqueTests}
  test shapes          ${exercises.filter((e) => e.testShape === 'lib').length} lib / ${exercises.filter((e) => e.testShape === 'main').length} main
  exercise editions    ${[...new Set(exercises.map((e) => e.edition))].sort().join(', ')}
  test editions        ${[...new Set(exercises.map((e) => e.testEdition))].sort().join(', ')}${
    exercises.filter((e) => e.testEdition !== e.edition).length
      ? ` (differs for: ${exercises.filter((e) => e.testEdition !== e.edition).map((e) => e.slug).join(', ')})`
      : ''
  }

  bin-only (no lib.rs) ${binOnly.join(', ') || 'none'}
  needs argv           ${argvEx.join(', ') || 'none'}
  external deps        ${withDeps.map((e) => `${e.slug} -> ${e.deps.map((d) => `${d.name} ${d.version}`).join(', ')}`).join(' | ') || 'none'}

  Content gaps
  no README            ${noReadme.join(', ') || 'none'}
  "README .md" bug     ${bugged.join(', ') || 'none'}
  no signature block   ${noSig.join(', ') || 'none'}
  stubs needing hand-authoring: ${new Set([...noReadme, ...noSig]).size} of ${exercises.length}
`);

if (notes.length) {
  console.log('  Notes (not failures)');
  for (const n of notes) console.log(`    - ${n}`);
  console.log('');
}

if (problems.length) {
  console.error('  FAILED — the tree disagrees with the plan:');
  for (const p of problems) console.error(`    ✗ ${p}`);
  console.error('');
  process.exit(1);
}

console.log('  ✅ tree matches the plan\n');
