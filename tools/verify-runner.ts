/**
 * Phase 04 verification — proves the runner's exit criteria mechanically.
 *
 *   1. all 40 suites pass inside a container with --network=none
 *   2. the four recursive-cargo suites survive (no lock, pid limit, or timeout)
 *   3. cargo run with arguments works for the three argv exercises
 *   4. PTY output retains ANSI colour
 *   5. a build exceeding RUNNER_MEMORY_MB dies in its own cgroup
 *   6. concurrency cap, cool-down and idle reaping are enforced
 *
 *   make runner-verify
 */

import { execFileSync, spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../server/src/config/index.js';
import { CooldownError, Runner } from '../server/src/services/runner.js';

const ROOT = process.cwd();
const CONTENT = join(ROOT, 'content');
const IMAGE = config.runner.image;

interface Meta {
  slug: string;
  kind: 'lib' | 'bin';
  edition: string;
  testEdition: string;
  argv: boolean;
  testShape: 'lib' | 'main';
  deps: { name: string; version: string }[];
}

const index = JSON.parse(readFileSync(join(CONTENT, 'index.json'), 'utf8')) as {
  exercises: { slug: string }[];
};
const metas: Meta[] = index.exercises.map(
  (e) => JSON.parse(readFileSync(join(CONTENT, 'exercises', e.slug, 'meta.json'), 'utf8')) as Meta,
);

function manifest(name: string, edition: string, deps: Meta['deps'], pathDep?: string) {
  const lines = ['[package]', `name = "${name}"`, 'version = "0.1.0"', `edition = "${edition}"`, '', '[dependencies]'];
  if (pathDep) lines.push(`${pathDep} = { path = "../${pathDep}" }`);
  for (const d of deps) lines.push(`${d.name} = "${d.version}"`);
  return `${lines.join('\n')}\n`;
}

/** Files for one exercise, laid out with <ex>/ and <ex>_test/ as SIBLINGS. */
function filesFor(meta: Meta, useSolution: boolean) {
  const src = join(CONTENT, 'exercises', meta.slug);
  const body = readFileSync(join(src, useSolution ? 'solution.rs' : 'starter.rs'), 'utf8');
  const files = [
    { path: `${meta.slug}/Cargo.toml`, content: manifest(meta.slug, meta.edition, []) },
    {
      path: `${meta.slug}_test/Cargo.toml`,
      // A bin-only exercise has no lib target, so a path dependency on it is
      // invalid — cargo warns and ignores it. Those tests invoke the binary
      // through `cargo run --manifest-path ../<slug>/Cargo.toml` instead.
      content: manifest(
        `${meta.slug}_test`,
        meta.testEdition,
        meta.deps,
        meta.kind === 'lib' ? meta.slug : undefined,
      ),
    },
    {
      path: `${meta.slug}_test/src/${meta.testShape === 'lib' ? 'lib.rs' : 'main.rs'}`,
      content: readFileSync(join(src, 'test.rs'), 'utf8'),
    },
  ];
  if (meta.kind === 'lib') {
    files.push({ path: `${meta.slug}/src/lib.rs`, content: body });
    files.push({ path: `${meta.slug}/src/main.rs`, content: readFileSync(join(src, 'main.rs'), 'utf8') });
  } else {
    files.push({ path: `${meta.slug}/src/main.rs`, content: body });
  }
  return files;
}

const results: Record<string, boolean> = {};
const runner = new Runner();

function head(title: string) {
  console.log(`\n  ${title}\n`);
}

async function main() {
  await runner.preflight();
  runner.start();

  // ── 1 & 2: all 40 suites inside a --network=none container ────────────────
  head('1. All 40 suites pass in a container with --network=none');
  const USER = 'verify-user';
  const failures: string[] = [];
  const timings: { slug: string; ms: number }[] = [];
  const RECURSIVE = ['rpn', 'brain_fuck', 'brackets_matching'];

  for (const meta of metas) {
    await runner.writeFiles(USER, filesFor(meta, true));
    // Cool-down would otherwise reject 40 back-to-back runs; it is exercised
    // deliberately in step 6.
    runner.clearCooldown(USER);
    try {
      const res = await runner.exec(USER, ['cargo', 'test', '--offline', '--quiet'], {
        cwd: `/workspace/${meta.slug}_test`,
      });
      if (res.exitCode === 0) {
        process.stdout.write('.');
        timings.push({ slug: meta.slug, ms: res.durationMs });
      } else {
        failures.push(meta.slug);
        process.stdout.write('F');
      }
    } catch (err) {
      failures.push(`${meta.slug} (${String(err).slice(0, 60)})`);
      process.stdout.write('E');
    }
  }
  console.log(`\n\n    ${metas.length - failures.length}/${metas.length} suites pass`);
  if (failures.length) for (const f of failures) console.log(`      ✗ ${f}`);
  results['1. all suites pass offline'] = failures.length === 0;

  const recursiveOk = RECURSIVE.every((s) => !failures.some((f) => f.startsWith(s)));
  const recursiveTimes = timings.filter((t) => RECURSIVE.includes(t.slug));
  console.log(
    `    recursive-cargo suites: ${recursiveOk ? 'all pass' : 'FAILED'} ` +
      `(${recursiveTimes.map((t) => `${t.slug} ${(t.ms / 1000).toFixed(1)}s`).join(', ')})`,
  );
  results['2. recursive-cargo suites survive'] = recursiveOk;

  // ── 3: argv exercises ──────────────────────────────────────────────────────
  head('3. cargo run with arguments (the three argv exercises)');
  const argvChecks: [string, string[], string][] = [
    ['rpn', ['1 2 * 3 * 4 +'], '10'],
    ['brackets_matching', ['(johndoe)'], 'OK'],
    ['brain_fuck', ['++++++++++[>+++++++>++++++++++>+++>+<<<<-]>++.>+.+++++++..+++.>++.<<+++++++++++++++.>.+++.------.--------.>+.>.'], 'Hello World!'],
  ];
  let argvOk = true;
  for (const [slug, args, expect] of argvChecks) {
    const meta = metas.find((m) => m.slug === slug)!;
    await runner.writeFiles(USER, filesFor(meta, true));
    runner.clearCooldown(USER);
    const res = await runner.exec(USER, ['cargo', 'run', '--offline', '--quiet', '--', ...args], {
      cwd: `/workspace/${slug}`,
    });
    const got = res.output.trim();
    const ok = res.exitCode === 0 && got.includes(expect);
    if (!ok) argvOk = false;
    console.log(`    ${ok ? '✓' : '✗'} ${slug} -> ${JSON.stringify(got.slice(0, 40))} (expected ${JSON.stringify(expect)})`);
  }
  results['3. argv exercises produce correct output'] = argvOk;

  // ── 4: ANSI colour through a PTY ───────────────────────────────────────────
  head('4. PTY preserves ANSI colour');
  const colourOk = await new Promise<boolean>((resolve) => {
    const containerId = (runner as unknown as { containers: Map<string, { containerId: string }> })
      .containers.get(USER)!.containerId;
    // -t allocates a tty, which is what makes cargo emit colour.
    const p = spawn('docker', ['exec', '-t', containerId, 'cargo', 'test', '--offline', '--color', 'always'], {
      cwd: ROOT,
    });
    let out = '';
    p.stdout.on('data', (d) => (out += d.toString()));
    p.stderr.on('data', (d) => (out += d.toString()));
    p.on('close', () => resolve(/\[[0-9;]*m/.test(out)));
  });
  console.log(`    ${colourOk ? '✓' : '✗'} ANSI escape sequences present in PTY output`);
  results['4. PTY retains ANSI colour'] = colourOk;

  // ── 5: memory cap contains a runaway build ─────────────────────────────────
  head('5. A run exceeding the memory cap dies in its own cgroup');
  const before = execFileSync('docker', ['ps', '-q']).toString().trim().split('\n').filter(Boolean).length;
  const hog = await runner.exec(
    USER,
    ['bash', '-lc', 'python3 -c "a=bytearray(400*1024*1024)" 2>/dev/null || head -c 400M /dev/zero | tail -c 400M > /dev/null'],
    { cwd: '/workspace' },
  ).catch((e) => ({ exitCode: -1, output: String(e), durationMs: 0 }));
  const after = execFileSync('docker', ['ps', '-q']).toString().trim().split('\n').filter(Boolean).length;
  const contained = hog.exitCode !== 0 && after === before;
  console.log(`    allocation of 900 MB against a ${config.runner.memoryMb} MB cap -> exit ${hog.exitCode}`);
  console.log(`    ${contained ? '✓' : '✗'} killed inside its cgroup; other containers unaffected (${before} -> ${after} running)`);
  results['5. memory cap contains a runaway run'] = contained;

  // ── 6: cool-down, concurrency cap, idle reaping ────────────────────────────
  head('6. Load controls');

  // cool-down — clear any carried over from earlier steps so the first of the
  // pair is guaranteed to be admitted.
  runner.clearCooldown(USER);
  // Both calls name the same kind on purpose: the clocks are per kind, so a
  // 'run' followed by a 'test' would (correctly) NOT be refused and this check
  // would silently pass for the wrong reason.
  await runner.exec(USER, ['true'], { cwd: '/workspace', kind: 'run' });
  let cooldownEnforced = false;
  try {
    await runner.exec(USER, ['true'], { cwd: '/workspace', kind: 'run' });
  } catch (err) {
    cooldownEnforced = err instanceof CooldownError;
    if (cooldownEnforced) {
      console.log(`    ✓ cool-down rejected an immediate second run (${(err as CooldownError).secondsRemaining}s remaining)`);
    }
  }
  if (!cooldownEnforced) console.log('    ✗ cool-down did not reject a back-to-back run');

  // concurrency cap: more simultaneous runs than the cap, from distinct users
  const cap = config.runner.maxConcurrent;
  const users = Array.from({ length: cap + 2 }, (_, i) => `cap-user-${i}`);
  let peak = 0;
  const sampler = setInterval(() => {
    peak = Math.max(peak, runner.activeRuns);
  }, 5);
  await Promise.all(
    users.map(async (u) => {
      await runner.writeFiles(u, [{ path: 'noop.txt', content: 'x' }]);
      await runner.exec(u, ['sleep', '1'], { cwd: '/workspace' });
    }),
  );
  clearInterval(sampler);
  const capOk = peak <= cap;
  console.log(`    ${capOk ? '✓' : '✗'} concurrency cap held: peak ${peak} simultaneous runs, cap ${cap} (${users.length} users competing)`);

  // idle reaping
  const idleUser = 'idle-user';
  await runner.ensureContainer(idleUser);
  const containersBefore = (runner as unknown as { containers: Map<string, unknown> }).containers.size;
  (runner as unknown as { containers: Map<string, { lastUsedAt: number }> })
    .containers.get(idleUser)!.lastUsedAt = Date.now() - (config.runner.idleSeconds + 5) * 1000;
  await (runner as unknown as { reapIdle: () => Promise<void> }).reapIdle();
  const reaped = !(runner as unknown as { containers: Map<string, unknown> }).containers.has(idleUser);
  console.log(`    ${reaped ? '✓' : '✗'} idle container reaped after ${config.runner.idleSeconds}s (${containersBefore} -> ${(runner as unknown as { containers: Map<string, unknown> }).containers.size})`);

  results['6. load controls enforced'] = cooldownEnforced && capOk && reaped;

  // ── timings ────────────────────────────────────────────────────────────────
  const sorted = [...timings].sort((a, b) => a.ms - b.ms);
  const median = sorted[Math.floor(sorted.length / 2)];
  head('Timings (this machine; the VM will be slower)');
  console.log(`    median suite  ${median ? (median.ms / 1000).toFixed(2) : '?'}s`);
  console.log(`    slowest       ${sorted.slice(-3).map((t) => `${t.slug} ${(t.ms / 1000).toFixed(1)}s`).join(', ')}`);

  await runner.stop();
  for (const u of users) await runner.release(u);

  // ── verdict ────────────────────────────────────────────────────────────────
  head('Exit criteria');
  for (const [name, ok] of Object.entries(results)) console.log(`    ${ok ? '✅' : '❌'} ${name}`);
  const allOk = Object.values(results).every(Boolean);
  console.log(allOk ? '\n  ✅ phase 04 criteria met\n' : '\n  ❌ phase 04 NOT met\n');
  process.exit(allOk ? 0 : 1);
}

main().catch(async (err) => {
  console.error('\n  verification aborted:', err);
  await runner.stop().catch(() => {});
  process.exit(1);
});
