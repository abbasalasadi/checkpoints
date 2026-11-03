/**
 * Go content gate, ported from the go-checkpoints reference (tools/verify-content.mjs).
 *
 * Reassembles the 01-edu tester workspace from content/go only:
 *   var/verify/go/piscine-go/   the "student" module — every solution.go
 *   var/verify/go/test-go/      harness lib/ (content/go/sources/test-go) + solutions/ + tests/
 * then runs each official test with the solution standing in for the student,
 * and (negative control) each starter alone in a fresh student module.
 *
 * Pins GOTOOLCHAIN=go1.25.12 (what the platform grades with) unless overridden;
 * an older local Go downloads that release on first run.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, contentDir, loadIndex, parseOnly } from '../lib/content.js';

const CONTENT = contentDir('go');
const WORK = path.join(ROOT, 'var', 'verify', 'go');
const argv = process.argv.slice(2);
const only = parseOnly(argv);

const index = loadIndex('go');
const all = index.exercises.filter((e) => !only || only.includes(e.slug));

const read = (slug: string, f: string) => fs.readFileSync(path.join(CONTENT, 'exercises', slug, f), 'utf8');
const write = (p: string, s: string) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};

// ── materialise ──────────────────────────────────────────────────────────────

fs.rmSync(WORK, { recursive: true, force: true });

// Two upstream solutions import the tester's own lib/is, so the student module
// must see the harness too (module cycle is allowed; no package cycle).
write(
  path.join(WORK, 'piscine-go/go.mod'),
  [
    'module piscine',
    '',
    'go 1.25',
    '',
    'require (',
    '\tgithub.com/01-edu/module/test-images/test-go v0.0.0',
    '\tgithub.com/01-edu/z01 v0.1.0',
    ')',
    '',
    'replace github.com/01-edu/module/test-images/test-go => ../test-go',
    '',
  ].join('\n'),
);
fs.mkdirSync(path.join(WORK, 'test-go'), { recursive: true });
for (const f of ['go.mod', 'go.sum']) {
  fs.copyFileSync(path.join(CONTENT, 'sources/test-go', f), path.join(WORK, 'test-go', f));
}
fs.cpSync(path.join(CONTENT, 'sources/test-go/lib'), path.join(WORK, 'test-go/lib'), { recursive: true });

// Every exercise, not just --only: solutions/ is one package and must compile whole.
for (const e of index.exercises) {
  const sol = read(e.slug, 'solution.go');
  if (e.kind === 'prog') {
    write(path.join(WORK, 'test-go/solutions', e.slug, 'main.go'), sol);
    write(path.join(WORK, 'piscine-go', e.slug, 'main.go'), sol);
  } else {
    write(path.join(WORK, 'test-go/solutions', `${e.slug}.go`), sol.replace(/^package\s+\w+/m, 'package solutions'));
    write(path.join(WORK, 'piscine-go', `${e.slug}.go`), sol);
  }
  write(path.join(WORK, 'test-go/tests', `${e.slug}_test`, 'main.go'), read(e.slug, 'test.go'));
}

// ── run ──────────────────────────────────────────────────────────────────────

const env = { ...process.env, GOFLAGS: '-mod=mod', GOTOOLCHAIN: process.env.GOTOOLCHAIN ?? 'go1.25.12' };
const tg = path.join(WORK, 'test-go');

// challenge.Program caches binaries under $TMPDIR keyed by path: give each run its own.
function runTest(slug: string, cwd: string) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `gv-${slug}-`));
  try {
    return spawnSync('go', ['run', `./tests/${slug}_test`], {
      cwd,
      env: { ...env, TMPDIR: tmp },
      encoding: 'utf8',
      timeout: 120_000,
    });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

console.log('resolving modules...');
for (const dir of [path.join(WORK, 'piscine-go'), tg]) {
  const r = spawnSync('go', ['mod', 'tidy'], { cwd: dir, env, encoding: 'utf8' });
  if (r.status !== 0) {
    console.error(`go mod tidy failed in ${dir}:\n${r.stderr}`);
    process.exit(1);
  }
}

let failed = 0;
console.log('\nsolutions must pass:');
for (const e of all) {
  const r = runTest(e.slug, tg);
  const ok = r.status === 0;
  if (!ok) failed++;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${e.slug.padEnd(20)} ${e.kind}`);
  if (!ok) console.log(`        ${(r.stderr || r.stdout || '').trim().split('\n').slice(0, 6).join('\n        ')}`);
}

// ── negative control: each starter alone must fail ──────────────────────────

if (!argv.includes('--no-negative')) {
  const NEG = path.join(WORK, 'neg');
  const negTg = path.join(NEG, 'test-go');
  fs.cpSync(tg, negTg, { recursive: true });
  const gomod = path.join(negTg, 'go.mod');
  fs.writeFileSync(gomod, fs.readFileSync(gomod, 'utf8').replace('=> ../piscine-go', '=> ../student-go'));
  const student = path.join(NEG, 'student-go');

  console.log('\nstarters must fail:');
  let leaky = 0;
  for (const e of all) {
    fs.rmSync(student, { recursive: true, force: true });
    write(path.join(student, 'go.mod'), 'module piscine\n\ngo 1.25.12\n');
    write(path.join(student, e.kind === 'prog' ? `${e.slug}/main.go` : `${e.slug}.go`), read(e.slug, 'starter.go'));
    if (runTest(e.slug, negTg).status === 0) {
      leaky++;
      failed++;
      console.log(`FAIL  ${e.slug.padEnd(20)} the starter PASSES — this exercise tests nothing`);
    }
  }
  console.log(`  ${all.length - leaky}/${all.length} starters correctly rejected`);
}

console.log(failed ? `\n  go: gate FAILED (${failed})\n` : '\n  go: gate PASSED\n');
process.exit(failed ? 1 : 0);
