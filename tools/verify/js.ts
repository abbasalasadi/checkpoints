/**
 * JS content gate, ported from the js-checkpoints reference (tools/gate.mjs).
 *
 * Runs the official module-js harness (content/js/sources/harness/test.mjs)
 * locally, offline, no Docker: puppeteer is stubbed since no checkpoint
 * exercise is a DOM exercise. Three cases per exercise:
 *   starter  must FAIL its test
 *   solution must PASS its test
 *   main     solution + main.js, run as the Run button does, must print
 */

import { spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ROOT, contentDir, loadIndex, parseOnly } from '../lib/content.js';

const argv = process.argv.slice(2);
const ALLOW_MISSING = argv.includes('--allow-missing');
const ONLY = parseOnly(argv);
const CONTENT = contentDir('js');
const EX = join(CONTENT, 'exercises');
const GATE = join(ROOT, 'var', 'verify', 'js');
const POOL = 8;

const index = loadIndex('js');

await rm(GATE, { recursive: true, force: true });
await mkdir(`${GATE}/app/tests`, { recursive: true });
await mkdir(`${GATE}/node_modules/puppeteer`, { recursive: true });
await cp(join(CONTENT, 'sources/harness/test.mjs'), `${GATE}/app/test.mjs`);
await writeFile(
  `${GATE}/node_modules/puppeteer/package.json`,
  JSON.stringify({ name: 'puppeteer', version: '0.0.0-stub', type: 'module', main: 'index.js' }),
);
await writeFile(
  `${GATE}/node_modules/puppeteer/index.js`,
  'export default { launch: () => { throw Error("puppeteer stub: DOM exercises need the real image") } };\n',
);
for (const e of index.exercises) await cp(`${EX}/${e.slug}/test.js`, `${GATE}/app/tests/${e.slug}_test.js`);

type Result = { passed: boolean; output: string; timedOut?: boolean };

// Each run gets its own TMPDIR: the harness writes ${tmpdir()}/${exercise}.mjs.
const run = (slug: string, studentDir: string, expectedFiles: string[]) =>
  new Promise<Result>((done) => {
    const child = spawn(process.execPath, [`${GATE}/app/test.mjs`, studentDir, slug, expectedFiles.join(',')], {
      cwd: GATE,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, TMPDIR: studentDir },
    });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    const kill = setTimeout(() => child.kill('SIGKILL'), 120_000);
    child.on('close', (code) => {
      clearTimeout(kill);
      done({ passed: code === 0, output: out });
    });
  });

// Run path: concatenate editor files into a CommonJS (sloppy-mode) run.js, as the entrypoint does.
const runMain = async (studentDir: string, editorFiles: string[]) => {
  const parts: string[] = [];
  for (const name of editorFiles) parts.push(await readFile(`${studentDir}/${name}`, 'utf8'));
  const file = `${studentDir}/__run.js`;
  await writeFile(file, `${parts.join('\n')}\n`);
  return new Promise<Result>((done) => {
    const child = spawn(process.execPath, [file], { cwd: studentDir, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (out += b));
    let timedOut = false;
    const kill = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, 30_000);
    child.on('close', (code) => {
      clearTimeout(kill);
      done({ passed: code === 0, output: out, timedOut });
    });
  });
};

const firstError = (out: string) =>
  out
    .split('\n')
    .find((l) => /^(Error|.*Error \[|AssertionError|Unable|Missing|ReferenceError|SyntaxError|TypeError)/.test(l.trim()))
    ?.trim() ??
  out.trim().split('\n').pop() ??
  '';

type Case = { slug: string; kind: 'starter' | 'solution' | 'main'; expect: 'pass' | 'fail'; expectedFiles: string[]; editorFiles?: string[] };
const cases: Case[] = [];
const missingSolutions: string[] = [];
for (const e of index.exercises) {
  if (ONLY && !ONLY.includes(e.slug)) continue;
  const expectedFiles = e.expectedFiles as string[];
  cases.push({ slug: e.slug, kind: 'starter', expect: 'fail', expectedFiles });
  const hasSolution = await readFile(`${EX}/${e.slug}/solution.js`, 'utf8').then(() => true, () => false);
  if (!hasSolution) {
    missingSolutions.push(e.slug);
    continue;
  }
  cases.push({ slug: e.slug, kind: 'solution', expect: 'pass', expectedFiles });
  cases.push({ slug: e.slug, kind: 'main', expect: 'pass', expectedFiles, editorFiles: e.editorFiles as string[] });
}

const results: (Case & { ok: boolean; error: string })[] = [];
let cursor = 0;
await Promise.all(
  Array.from({ length: POOL }, async () => {
    while (cursor < cases.length) {
      const c = cases[cursor++];
      const dir = `${GATE}/work/${c.kind}/${c.slug}`;
      await mkdir(dir, { recursive: true });
      const source = `${EX}/${c.slug}/${c.kind === 'starter' ? 'starter.js' : 'solution.js'}`;
      for (const f of c.expectedFiles) await cp(source, `${dir}/${f}`);

      if (c.kind === 'main') {
        await cp(`${EX}/${c.slug}/main.js`, `${dir}/main.js`);
        const { passed, output, timedOut } = await runMain(dir, c.editorFiles ?? []);
        const printed = output.trim().length > 0;
        // Printing is the bar; a kill after output (js-zoo-race timers) is fine.
        const ok = printed && (passed || !!timedOut);
        results.push({ ...c, ok, error: ok ? '' : printed ? firstError(output) : 'main.js printed nothing' });
        continue;
      }
      const { passed, output } = await run(c.slug, dir, c.expectedFiles);
      results.push({ ...c, ok: passed === (c.expect === 'pass'), error: passed ? '' : firstError(output) });
    }
  }),
);

results.sort((a, b) => a.slug.localeCompare(b.slug) || a.kind.localeCompare(b.kind));
const of = (k: Case['kind']) => results.filter((r) => r.kind === k);
const bad = (k: Case['kind']) => of(k).filter((r) => !r.ok);

console.log(`starters : ${of('starter').length - bad('starter').length}/${of('starter').length} correctly fail`);
console.log(`solutions: ${of('solution').length - bad('solution').length}/${of('solution').length} pass`);
console.log(`main.js  : ${of('main').length - bad('main').length}/${of('main').length} run and print`);
for (const r of bad('starter')) console.log(`  ! ${r.slug} starter PASSED its test`);
for (const r of bad('solution')) console.log(`  x ${r.slug}: ${r.error}`);
for (const r of bad('main')) console.log(`  x ${r.slug} main.js: ${r.error}`);
if (missingSolutions.length) console.log(`missing  : ${missingSolutions.join(', ')}`);

const failed =
  bad('starter').length + bad('solution').length + bad('main').length + (ALLOW_MISSING ? 0 : missingSolutions.length);
console.log(failed ? `\n  js: gate FAILED (${failed})\n` : '\n  js: gate PASSED\n');
process.exit(failed ? 1 : 0);
