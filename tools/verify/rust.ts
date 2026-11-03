/**
 * Phase 03, step 3 — the acceptance gate.
 *
 * Two independent checks, both mechanical:
 *
 *   A. Every starter is exactly the README's expected code. Nothing may leak
 *      from solution.rs — an earlier version "repaired" starters that failed
 *      `cargo check` by rebuilding them from the solution, which handed
 *      students return types, parameters and whole designs the checkpoint
 *      withholds. A starter that does not compile is reported, not rewritten.
 *
 *   B. Every solution still passes its tests, materialised from content/ into a
 *      scratch tree. This is the proof the restructure is lossless: the same 40
 *      suites must behave identically before and after.
 *
 * Runs against the LOCAL cargo — the runner does not exist until phase 04, and
 * this phase must not wait for it.
 *
 *   npx tsx tools/verify.ts --lang rust [--only slug,slug]
 */

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { starterFromReadme } from '../lib/rust-source.js';
import { ROOT } from '../lib/content.js';

const CONTENT = join(ROOT, 'content', 'rust');
const SCRATCH = join(ROOT, 'var', 'verify', 'rust');

interface Meta {
  slug: string;
  kind: 'lib' | 'bin';
  edition: string;
  testEdition: string;
  argv: boolean;
  testShape: 'lib' | 'main';
  deps: { name: string; version: string }[];
  starterFrom: string;
}

const index = JSON.parse(readFileSync(join(CONTENT, 'index.json'), 'utf8')) as {
  exercises: { slug: string }[];
};

/** Generate the manifest rather than storing it — all 195 reduce to this. */
function manifest(name: string, edition: string, deps: { name: string; version: string }[], pathDep?: string) {
  const lines = [
    '[package]',
    `name = "${name}"`,
    'version = "0.1.0"',
    `edition = "${edition}"`,
    '',
    '[dependencies]',
  ];
  if (pathDep) lines.push(`${pathDep} = { path = "../${pathDep}" }`);
  for (const d of deps) lines.push(`${d.name} = "${d.version}"`);
  return `${lines.join('\n')}\n`;
}

/**
 * Lay out one exercise exactly as the runner will: <ex>/ and <ex>_test/ as
 * SIBLINGS. Four test crates reference ../<ex>/Cargo.toml by relative path, so
 * flattening this would break them.
 */
function materialiseCrate(meta: Meta, dir: string, useSolution: boolean) {
  const exDir = join(dir, meta.slug);
  const testDir = join(dir, `${meta.slug}_test`);
  mkdirSync(join(exDir, 'src'), { recursive: true });
  mkdirSync(join(testDir, 'src'), { recursive: true });

  const src = join(CONTENT, 'exercises', meta.slug);
  const body = readFileSync(join(src, useSolution ? 'solution.rs' : 'starter.rs'), 'utf8');
  const mainRs = readFileSync(join(src, 'main.rs'), 'utf8');

  writeFileSync(join(exDir, 'Cargo.toml'), manifest(meta.slug, meta.edition, []));
  if (meta.kind === 'lib') {
    writeFileSync(join(exDir, 'src', 'lib.rs'), body);
    writeFileSync(join(exDir, 'src', 'main.rs'), mainRs);
  } else {
    // bin-only: the implementation IS main.rs
    writeFileSync(join(exDir, 'src', 'main.rs'), body);
  }

  writeFileSync(
    join(testDir, 'Cargo.toml'),
    manifest(`${meta.slug}_test`, meta.testEdition, meta.deps, meta.slug),
  );
  writeFileSync(
    join(testDir, 'src', meta.testShape === 'lib' ? 'lib.rs' : 'main.rs'),
    readFileSync(join(src, 'test.rs'), 'utf8'),
  );
  return { exDir, testDir };
}

function run(cmd: string, args: string[], cwd: string, timeoutMs: number) {
  try {
    const out = execFileSync(cmd, args, { cwd, timeout: timeoutMs, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, output: out.toString() };
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    return { ok: false, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

const onlyIdx = process.argv.indexOf('--only');
const only = onlyIdx >= 0 ? process.argv[onlyIdx + 1].split(',') : null;
const metas: Meta[] = index.exercises.filter((e) => !only || only.includes(e.slug)).map(
  (e) => JSON.parse(readFileSync(join(CONTENT, 'exercises', e.slug, 'meta.json'), 'utf8')) as Meta,
);

// ── A. every starter is the README contract, and nothing more ────────────────

console.log('\n  A. Starters must come from the README, never the solution\n');
rmSync(SCRATCH, { recursive: true, force: true });
mkdirSync(SCRATCH, { recursive: true });

const starterFailures: string[] = [];
const incomplete: string[] = [];

for (const meta of metas) {
  const src = join(CONTENT, 'exercises', meta.slug);
  const starter = readFileSync(join(src, 'starter.rs'), 'utf8');
  const expected = starterFromReadme(readFileSync(join(src, 'README.md'), 'utf8'), meta.slug, meta.kind);

  if (starter !== expected || meta.starterFrom !== 'readme') {
    starterFailures.push(meta.slug);
    console.log(`    ✗ ${meta.slug}: starter.rs differs from the README's expected code`);
    continue;
  }

  // Informational only. A README may leave a deliberate gap — a return type,
  // parameters, a type alias — and filling it is the exercise, so the starter
  // is never "repaired" into compiling.
  const dir = join(SCRATCH, 'starters', meta.slug);
  mkdirSync(dir, { recursive: true });
  const { exDir } = materialiseCrate(meta, dir, false);
  if (!run('cargo', ['check', '--offline', '--quiet'], exDir, 120_000).ok) incomplete.push(meta.slug);
}

console.log(
  `    ${metas.length - starterFailures.length}/${metas.length} starters match their README` +
    (incomplete.length ? `\n    ${incomplete.length} compile only once the student fills the gaps: ${incomplete.join(', ')}` : ''),
);
if (starterFailures.length) {
  console.log('\n    Regenerate from the README with starterFromReadme() — never from solution.rs.');
}

// ── B. acceptance gate: solutions still pass their tests ─────────────────────

console.log('\n  B. Acceptance gate — solutions must pass their tests\n');

const testFailures: string[] = [];
let passed = 0;

for (const meta of metas) {
  const dir = join(SCRATCH, 'suites', meta.slug);
  mkdirSync(dir, { recursive: true });
  const { testDir } = materialiseCrate(meta, dir, true);

  // Generous timeout: four suites spawn cargo recursively, ~20 nested runs.
  const res = run('cargo', ['test', '--offline', '--quiet'], testDir, 180_000);
  if (res.ok) {
    passed += 1;
    process.stdout.write('.');
  } else {
    testFailures.push(meta.slug);
    process.stdout.write('F');
  }
}

console.log(`\n\n    ${passed}/${metas.length} suites pass from content/`);

if (testFailures.length) {
  console.log('\n    Failing suites:');
  for (const f of testFailures) console.log(`      ✗ ${f}`);
}

// ── C. negative control: starters must fail their tests ──────────────────────

console.log('\n  C. Negative control — starters must NOT pass their tests\n');
const leaky: string[] = [];
for (const meta of metas) {
  const dir = join(SCRATCH, 'negative', meta.slug);
  mkdirSync(dir, { recursive: true });
  const { testDir } = materialiseCrate(meta, dir, false);
  if (run('cargo', ['test', '--offline', '--quiet'], testDir, 180_000).ok) {
    leaky.push(meta.slug);
    process.stdout.write('!');
  } else process.stdout.write('.');
}
console.log(`\n\n    ${metas.length - leaky.length}/${metas.length} starters correctly rejected`);
for (const f of leaky) console.log(`      ! ${f}: starter PASSES its test`);

// ── verdict ──────────────────────────────────────────────────────────────────

const ok = starterFailures.length === 0 && testFailures.length === 0 && leaky.length === 0;
console.log(
  ok
    ? '\n  rust: gate PASSED\n'
    : '\n  rust: gate FAILED\n',
);
process.exit(ok ? 0 : 1);
