/**
 * Config tests. Operational settings fall back to the Rust defaults (D16) and
 * are overridable from .env. Environment-dependent cases run in a child
 * process, because config is evaluated once at import.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '../..');

/** Evaluate config in a fresh process with the given environment. */
function configWith(env: Record<string, string>): Record<string, unknown> {
  const out = execFileSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '-e',
      "const { config } = await import('./src/config/index.ts'); process.stdout.write(JSON.stringify({ ...config, devLoginEnabled: config.devLoginEnabled }));"],
    { cwd: serverDir, env: { ...process.env, LOG_ENABLED: 'false', ...env }, timeout: 15000 },
  );
  return JSON.parse(String(out)) as Record<string, unknown>;
}

test('.env.example names override the defaults (COOLDOWN_*_SEC, RUNNER_CONCURRENCY)', () => {
  const c = configWith({ COOLDOWN_RUN_SEC: '5', COOLDOWN_SUBMIT_SEC: '7', RUNNER_CONCURRENCY: '2' });
  const r = c.runner as Record<string, number>;
  assert.equal(r.cooldownRunSeconds, 5);
  assert.equal(r.cooldownTestSeconds, 7);
  assert.equal(r.maxConcurrent, 2);
});

test('dev-login needs DEV_LOGIN=true and is never on in production', () => {
  assert.equal(configWith({ APP_ENV: 'production', DEV_LOGIN: 'true' }).devLoginEnabled, false);
  assert.equal(configWith({ APP_ENV: 'dev' }).devLoginEnabled, false);
  assert.equal(configWith({ APP_ENV: 'dev', DEV_LOGIN: 'true' }).devLoginEnabled, true);
});

test('config defaults are the values the plan specifies', async () => {
  const { config } = await import('../../src/config/index.ts');
  assert.equal(config.runner.maxConcurrent, 3, 'concurrency cap sized for the 1.9 GB VM');
  // Run and Test throttle on separate clocks. Test is the graded action and
  // waits longer; Run stays short so checking your work before submitting is
  // not punished.
  assert.equal(config.runner.cooldownRunSeconds, 30);
  assert.equal(config.runner.cooldownTestSeconds, 90);
  assert.equal(config.runner.idleSeconds, 60);
  // 384, not 256: measured. brackets_matching_test pulls rand -> zerocopy,
  // which is OOM-killed at 256 MB even with CARGO_BUILD_JOBS=1.
  assert.equal(config.runner.memoryMb, 384);
  assert.equal(config.runner.cpus, 0.5);
  assert.equal(config.runner.timeoutSeconds, 60);
  assert.equal(config.runner.outputLimitBytes, 1024 * 1024);
  assert.equal(config.apiPort, 8157);
});

// ── username-only login ──────────────────────────────────────────────────────

test('an email address is rejected as an identifier', async () => {
  const { assertUsername, InvalidIdentifierError } = await import('../../src/services/auth.ts');
  assert.throws(() => assertUsername('student@reboot01.com'), InvalidIdentifierError);
  assert.throws(() => assertUsername('  abbhasan@gmail.com  '), InvalidIdentifierError);
});

test('a username with spaces or an empty value is rejected', async () => {
  const { assertUsername, InvalidIdentifierError } = await import('../../src/services/auth.ts');
  assert.throws(() => assertUsername('abb hasan'), InvalidIdentifierError);
  assert.throws(() => assertUsername('   '), InvalidIdentifierError);
  assert.throws(() => assertUsername('x'.repeat(65)), InvalidIdentifierError);
});

test('a plain reboot01 username is accepted', async () => {
  const { assertUsername } = await import('../../src/services/auth.ts');
  // Deliberately permissive about the character set: rejecting what an email
  // definitely is beats guessing what a username may contain.
  assert.doesNotThrow(() => assertUsername('abbhasan'));
  assert.doesNotThrow(() => assertUsername('  abbhasan  '));
  assert.doesNotThrow(() => assertUsername('abb-hasan_01'));
});
