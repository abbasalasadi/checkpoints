#!/usr/bin/env node
// Assemble the runner build contexts and (optionally) build the images.
//
//   node scripts/build-runner-images.mjs [--no-build] [--only go,js,rust,java]
//
// Ported from the references' tools/build-image.mjs (go-checkpoints and
// js-checkpoints). content/<lang>/ keeps one canonical copy per exercise; the
// Go and JS images want them gathered into the tester's layout, so the context
// is generated under var/build/runner-<lang>/ and never hand-edited. The Rust
// image is built straight from docker/runner/ (its Dockerfile has no COPY).
//
// Image tags come from the environment, same defaults as the server:
//   RUNNER_IMAGE (rust), RUNNER_GO_IMAGE, RUNNER_JS_IMAGE
//
// Run on the VM (scripts/deploy/runner-image.sh, `make images`), not the laptop.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUILD = path.join(ROOT, 'var/build');

const argv = process.argv.slice(2);
const NO_BUILD = argv.includes('--no-build');
const onlyArg = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : 'go,js,rust,java';
const ONLY = new Set(onlyArg.split(',').map((s) => s.trim()).filter(Boolean));

const env = (name, fallback) => (process.env[name] && process.env[name].trim()) || fallback;
const TAGS = {
  rust: env('RUNNER_IMAGE', 'rust-checkpoints-runner:latest'),
  go: env('RUNNER_GO_IMAGE', 'go-checkpoints-runner:dev'),
  js: env('RUNNER_JS_IMAGE', 'js-checkpoints-runner:dev'),
  java: env('RUNNER_JAVA_IMAGE', 'java-checkpoints-runner:dev'),
};

const write = (p, s) => {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, s);
};
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const fresh = (dir) => {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  return dir;
};

// ── Go ───────────────────────────────────────────────────────────────────────

function goContext() {
  const CONTENT = path.join(ROOT, 'content/go');
  const CTX = fresh(path.join(BUILD, 'runner-go'));
  const index = JSON.parse(fs.readFileSync(path.join(CONTENT, 'index.json'), 'utf8'));
  const exDir = (e) => path.join(CONTENT, e.dir ?? `exercises/${e.slug}`);
  const read = (e, f) => fs.readFileSync(path.join(exDir(e), f), 'utf8');

  for (const f of ['go.mod', 'go.sum']) {
    write(path.join(CTX, 'test-go', f), fs.readFileSync(path.join(CONTENT, 'sources/test-go', f), 'utf8'));
  }
  fs.cpSync(path.join(CONTENT, 'sources/test-go/lib'), path.join(CTX, 'test-go/lib'), { recursive: true });

  // test-go/solutions/ is one Go package the tests call as `solutions.X`, so a
  // function exercise's `package piscine` is renamed there and only there.
  for (const e of index.exercises) {
    const sol = read(e, 'solution.go');
    write(
      path.join(CTX, 'test-go/solutions', e.kind === 'prog' ? `${e.slug}/main.go` : `${e.slug}.go`),
      e.kind === 'prog' ? sol : sol.replace(/^package\s+\w+/m, 'package solutions'),
    );
    write(path.join(CTX, 'test-go/tests', `${e.slug}_test`, 'main.go'), read(e, 'test.go'));
  }

  // The student module the runner drops in at run time (z01 only).
  const harnessSum = fs.readFileSync(path.join(CONTENT, 'sources/test-go/go.sum'), 'utf8');
  write(path.join(CTX, 'piscine-go-template/go.mod'), 'module piscine\n\ngo 1.25.12\n\nrequire github.com/01-edu/z01 v0.1.0\n');
  write(path.join(CTX, 'piscine-go-template/go.sum'), harnessSum);

  // The cache-warming seed: a complete student module holding the reference
  // solutions. Build-time only, it may also reach the harness.
  write(
    path.join(CTX, 'piscine-go-seed/go.mod'),
    [
      'module piscine',
      '',
      'go 1.25.12',
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
  write(path.join(CTX, 'piscine-go-seed/go.sum'), harnessSum);
  for (const e of index.exercises) {
    write(
      path.join(CTX, 'piscine-go-seed', e.kind === 'prog' ? `${e.slug}/main.go` : `${e.slug}.go`),
      read(e, 'solution.go'),
    );
  }

  for (const f of ['Dockerfile', 'entrypoint.sh']) {
    fs.copyFileSync(path.join(ROOT, 'docker/runner-go', f), path.join(CTX, f));
  }
  fs.chmodSync(path.join(CTX, 'entrypoint.sh'), 0o755);

  const manifest = Object.fromEntries(
    index.exercises.flatMap((e) => [
      [`tests/${e.slug}_test/main.go`, sha256(read(e, 'test.go'))],
      [`solutions/${e.slug}`, sha256(read(e, 'solution.go'))],
    ]),
  );
  write(path.join(CTX, 'test-go/content.sha256.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`go: ${index.exercises.length} tests + solutions, harness, template -> ${path.relative(ROOT, CTX)}`);
  return CTX;
}

// ── JS ───────────────────────────────────────────────────────────────────────

function jsContext() {
  const CONTENT = path.join(ROOT, 'content/js');
  const CTX = fresh(path.join(BUILD, 'runner-js'));
  const index = JSON.parse(fs.readFileSync(path.join(CONTENT, 'index.json'), 'utf8'));

  fs.mkdirSync(path.join(CTX, 'app/tests'), { recursive: true });
  fs.copyFileSync(path.join(CONTENT, 'sources/harness/test.mjs'), path.join(CTX, 'app/test.mjs'));
  fs.copyFileSync(path.join(ROOT, 'docker/runner-js/entrypoint.sh'), path.join(CTX, 'app/entrypoint.sh'));
  fs.chmodSync(path.join(CTX, 'app/entrypoint.sh'), 0o755);
  fs.copyFileSync(path.join(ROOT, 'docker/runner-js/Dockerfile'), path.join(CTX, 'Dockerfile'));
  fs.cpSync(path.join(ROOT, 'docker/runner-js/stub/puppeteer'), path.join(CTX, 'node_modules/puppeteer'), {
    recursive: true,
  });
  for (const e of index.exercises) {
    const dir = path.join(CONTENT, e.dir ?? `exercises/${e.slug}`);
    fs.copyFileSync(path.join(dir, 'test.js'), path.join(CTX, 'app/tests', `${e.slug}_test.js`));
  }

  console.log(`js: harness + ${index.exercises.length} tests + puppeteer stub -> ${path.relative(ROOT, CTX)}`);
  return CTX;
}

// ── Java ─────────────────────────────────────────────────────────────────────

// The official layout: /app/{pom.xml,entrypoint.sh}, /app/tests/<Class>_test/ and the
// two harness classes beside them (tests reference /app/tests/... by absolute path).
function javaContext() {
  const CONTENT = path.join(ROOT, 'content/java');
  const CTX = fresh(path.join(BUILD, 'runner-java'));
  const index = JSON.parse(fs.readFileSync(path.join(CONTENT, 'index.json'), 'utf8'));
  const harness = path.join(CONTENT, 'sources/harness');
  fs.mkdirSync(path.join(CTX, 'app/tests'), { recursive: true });
  fs.copyFileSync(path.join(harness, 'pom.xml'), path.join(CTX, 'app/pom.xml'));
  fs.copyFileSync(path.join(harness, 'entrypoint.sh'), path.join(CTX, 'app/entrypoint.sh'));
  fs.copyFileSync(path.join(ROOT, 'docker/runner-java/run.sh'), path.join(CTX, 'app/run.sh'));
  for (const f of ['TestRunnerMain.java', 'StopAfterFailureExtension.java']) fs.copyFileSync(path.join(harness, f), path.join(CTX, 'app/tests', f));
  fs.copyFileSync(path.join(ROOT, 'docker/runner-java/Dockerfile'), path.join(CTX, 'Dockerfile'));
  for (const e of index.exercises) {
    const dir = path.join(CONTENT, e.dir ?? `exercises/${e.slug}`);
    fs.cpSync(path.join(dir, 'test'), path.join(CTX, 'app/tests', `${e.className}_test`), { recursive: true });
  }
  // One reference solution fills the offline Maven repository at build time.
  fs.cpSync(path.join(CONTENT, 'exercises/factorial/solution'), path.join(CTX, 'app/warm'), { recursive: true });
  console.log(`java: harness + ${index.exercises.length} tests -> ${path.relative(ROOT, CTX)}`);
  return CTX;
}

// ── Rust ─────────────────────────────────────────────────────────────────────

function rustContext() {
  const CTX = path.join(ROOT, 'docker/runner');
  if (!fs.existsSync(path.join(CTX, 'Dockerfile'))) throw new Error('docker/runner/Dockerfile is missing');
  console.log(`rust: ${path.relative(ROOT, CTX)} (as is)`);
  return CTX;
}

// ── main ─────────────────────────────────────────────────────────────────────

const contexts = { go: goContext, js: jsContext, rust: rustContext, java: javaContext };
let failed = false;
for (const lang of ['go', 'js', 'rust', 'java']) {
  if (!ONLY.has(lang)) continue;
  const ctx = contexts[lang]();
  if (NO_BUILD) continue;
  console.log(`building ${TAGS[lang]} ...`);
  const t0 = Date.now();
  const r = spawnSync('docker', ['build', '-t', TAGS[lang], ctx], { stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`ERROR: ${lang} image build failed`);
    failed = true;
    continue;
  }
  console.log(`${TAGS[lang]} built in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}
process.exit(failed ? 1 : 0);
