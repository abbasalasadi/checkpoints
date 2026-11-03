/**
 * Config tests. These cover the two behaviours the scaffolding phase promises:
 * required secrets abort startup, operational settings fall back silently.
 *
 * loadSecrets() calls process.exit, so it is exercised in a child process
 * rather than mocked — a mock here would test the mock, not the behaviour.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '../..');
const entry = resolve(serverDir, 'src/main.ts');

function startWith(env: Record<string, string>): { code: number; stderr: string } {
  try {
    execFileSync(process.execPath, ['--import', 'tsx', entry], {
      cwd: serverDir,
      env: { ...process.env, ...env, API_PORT: '0', LOG_ENABLED: 'false' },
      timeout: 8000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stderr?: Buffer; signal?: string };
    // A clean start has no exit — the timeout kills it. That is success here.
    if (e.signal === 'SIGTERM') return { code: 0, stderr: String(e.stderr ?? '') };
    return { code: e.status ?? -1, stderr: String(e.stderr ?? '') };
  }
}

test('aborts with a clear message when SESSION_SIGNING_KEY is missing', () => {
  const { code, stderr } = startWith({ SESSION_SIGNING_KEY: '' });
  assert.equal(code, 1, 'should exit non-zero');
  assert.match(stderr, /SESSION_SIGNING_KEY/, 'should name the missing variable');
  assert.match(stderr, /openssl rand/, 'should say how to fix it');
});

test('starts when only operational settings are absent', () => {
  // No API_PORT/LOG_LEVEL/DB_PATH set: all have safe defaults.
  const { code } = startWith({ SESSION_SIGNING_KEY: 'test-key-not-a-real-secret' });
  assert.equal(code, 0, 'missing operational settings must not be fatal');
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
