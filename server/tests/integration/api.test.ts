/**
 * API integration tests, run against a REAL SQLite file rather than mocks —
 * a mocked repository would test the mock, not the ownership rules. The run
 * dispatcher is the one fake: it is a separate module with its own tests.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createServer, type Server } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { config } from '../../src/config/index.ts';
// Tests sign in with fake users; the app keeps dev-login off unless opted in (D17).
config.devLoginOptIn = true;
import { closeDatabase, getDb, migrate, openDatabase } from '../../src/db/index.ts';
import { attempts, hashToken, progress, sessions, snapshots, users } from '../../src/repositories/index.ts';
import { handle } from '../../src/routes/index.ts';
import { listExercises } from '../../src/services/exercises.ts';
import { setRunnerModule, type SubmitInput } from '../../src/services/runs.ts';

let dir: string;
let server: Server;
let base: string;

// ── fake dispatcher ──────────────────────────────────────────────────────────

const submitted: SubmitInput[] = [];
const fakeRuns = new Map<string, { id: string; user: string; state: string; output: string; events: EventEmitter }>();

setRunnerModule({
  submitRun(input) {
    submitted.push(input);
    const id = `run${submitted.length}`;
    const run = { id, user: String(input.user), state: 'queued', output: '', events: new EventEmitter() };
    fakeRuns.set(id, run);
    // Finish asynchronously, like the real queue.
    setImmediate(() => {
      run.output = 'ok\n';
      run.state = 'done';
      run.events.emit('event', { type: 'done', outcome: 'passed', exitCode: 0, durationMs: 5, truncated: false });
    });
    return id;
  },
  getRun: (id) => fakeRuns.get(id),
});

// ── helpers ──────────────────────────────────────────────────────────────────

async function call(path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) {
  const res = await fetch(base + path, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  return { status: res.status, json: text ? (JSON.parse(text) as Record<string, any>) : {}, setCookie: res.headers.get('set-cookie') };
}

async function devLogin(username: string): Promise<string> {
  const r = await call('/api/auth/dev-login', { method: 'POST', body: { username } });
  assert.equal(r.status, 200);
  const m = /cp_session=([^;]+)/.exec(r.setCookie ?? '');
  assert.ok(m?.[1], 'dev-login must set cp_session');
  return `cp_session=${m[1]}`;
}

before(async () => {
  dir = mkdtempSync(join(tmpdir(), 'rc-test-'));
  openDatabase(join(dir, 'test.db'));
  migrate();
  server = createServer((req, res) => void handle(req, res));
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

// ── repositories ─────────────────────────────────────────────────────────────

test('migrations are idempotent — a second run applies nothing', () => {
  assert.equal(migrate().length, 0);
});

test('identity is keyed on the identifier, not on a JWT claim', () => {
  const u = users.upsertOnLogin('  StudentOne  ', null, null);
  assert.equal(u.identifier_normalized, 'studentone');
  assert.equal(u.reboot_user_id, null);
  const again = users.upsertOnLogin('STUDENTONE', null, { sub: '42' });
  assert.equal(again.id, u.id, 'must not create a second user');
});

test('a reboot user id is adopted once seen, and never lost afterwards', () => {
  users.upsertOnLogin('claimy', 'reboot-99', { sub: 'reboot-99' });
  assert.equal(users.upsertOnLogin('claimy', null, null).reboot_user_id, 'reboot-99');
});

test('progress is scoped to its owner and to its language', () => {
  const alice = users.upsertOnLogin('alice', null, null);
  const bob = users.upsertOnLogin('bob', null, null);
  progress.save(alice.id, 'rust', 'min_and_max', { files: { 'src/lib.rs': 'alice code' } });

  assert.equal(progress.get(alice.id, 'rust', 'min_and_max')?.files?.['src/lib.rs'], 'alice code');
  assert.equal(progress.get(bob.id, 'rust', 'min_and_max'), undefined);
  // Same slug, other language: a different row.
  assert.equal(progress.get(alice.id, 'go', 'min_and_max'), undefined);
});

test('sessions store only the SHA-256 of the token', () => {
  const u = users.upsertOnLogin('hashy', null, null);
  const { token, session } = sessions.create(u.id, 12, null);
  assert.equal(session.token_hash, hashToken(token));
  assert.notEqual(session.token_hash, token);
  const raw = getDb().prepare('SELECT COUNT(*) AS n FROM sessions WHERE token_hash = ?').get(token) as { n: number };
  assert.equal(raw.n, 0, 'the raw token must not be stored');
  assert.ok(sessions.findValid(token));
});

test('expired, revoked and unknown sessions are rejected; revocation is per session', () => {
  const u = users.upsertOnLogin('revoker', null, null);
  assert.equal(sessions.findValid(sessions.create(u.id, -1, null).token), undefined);
  const a = sessions.create(u.id, 12, 'device-a');
  const b = sessions.create(u.id, 12, 'device-b');
  sessions.revoke(a.session.token_hash);
  assert.equal(sessions.findValid(a.token), undefined);
  assert.ok(sessions.findValid(b.token));
  assert.equal(sessions.findValid('not-a-real-session'), undefined);
});

// ── HTTP ─────────────────────────────────────────────────────────────────────

test('dev-login works outside production and is 404 in production', async () => {
  assert.ok(await devLogin('devuser'));
  const saved = config.appEnv;
  config.appEnv = 'production';
  try {
    const r = await call('/api/auth/dev-login', { method: 'POST', body: { username: 'devuser' } });
    assert.equal(r.status, 404);
    assert.equal(r.setCookie, null);
  } finally {
    config.appEnv = saved;
  }
});

test('dev-login rejects an email address', async () => {
  const r = await call('/api/auth/dev-login', { method: 'POST', body: { username: 'a@b.com' } });
  assert.equal(r.status, 400);
});

test('exercise routes require a session and an known language', async () => {
  assert.equal((await call('/api/rust/exercises')).status, 401);
  const cookie = await devLogin('lister');
  assert.equal((await call('/api/cobol/exercises', { cookie })).status, 404);
  const r = await call('/api/rust/exercises', { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.exercises.length, listExercises('rust').length);
  assert.ok(r.json.exercises.every((e: { language: string }) => e.language === 'rust'));
});

test('an exercise is served with files and without its test', async () => {
  const slug = listExercises('rust')[0]?.slug;
  assert.ok(slug, 'content/rust must have exercises');
  const cookie = await devLogin('reader');
  const r = await call(`/api/rust/exercises/${slug}`, { cookie });
  assert.equal(r.status, 200);
  assert.equal(r.json.language, 'rust');
  assert.ok(r.json.files && typeof r.json.files === 'object');
  assert.equal(r.json.test, undefined);
  assert.ok(!JSON.stringify(r.json).includes('"test"'));
});

test('save, snapshot, restore and reset round-trip; foreign files are refused', async () => {
  const ex = listExercises('rust')[0]!;
  const cookie = await devLogin('saver');
  const file = (await call(`/api/rust/exercises/${ex.slug}`, { cookie })).json.editorFiles[0] as string;

  assert.equal((await call(`/api/rust/exercises/${ex.slug}/code`, { method: 'PUT', cookie, body: { files: { 'evil.sh': 'x' } } })).status, 400);
  assert.equal((await call(`/api/rust/exercises/${ex.slug}/code`, { method: 'PUT', cookie, body: { files: { [file]: 'v1' } } })).status, 200);
  const snap = await call(`/api/rust/exercises/${ex.slug}/snapshots`, { method: 'POST', cookie, body: {} });
  assert.equal(snap.status, 200);
  await call(`/api/rust/exercises/${ex.slug}/code`, { method: 'PUT', cookie, body: { files: { [file]: 'v2' } } });
  const restored = await call(`/api/rust/exercises/${ex.slug}/snapshots/restore`, { method: 'POST', cookie, body: { id: snap.json.id } });
  assert.equal(restored.json.files[file], 'v1');

  // Another student cannot restore it.
  const other = await devLogin('snooper');
  assert.equal((await call(`/api/rust/exercises/${ex.slug}/snapshots/restore`, { method: 'POST', cookie: other, body: { id: snap.json.id } })).status, 404);

  const reset = await call(`/api/rust/exercises/${ex.slug}/reset`, { method: 'POST', cookie });
  assert.equal(reset.status, 200);
  const after = await call(`/api/rust/exercises/${ex.slug}`, { cookie });
  assert.notEqual(after.json.files[file], 'v1');
});

test('a submit goes to the dispatcher with language, and a pass is recorded', async () => {
  const ex = listExercises('rust')[0]!;
  const cookie = await devLogin('runner');
  const r = await call(`/api/rust/exercises/${ex.slug}/test`, { method: 'POST', cookie, body: {} });
  assert.equal(r.status, 200);
  assert.ok(r.json.runId);
  assert.equal(r.json.cooldownSeconds, 60);

  const input = submitted.at(-1)!;
  assert.equal(input.language, 'rust');
  assert.equal(input.mode, 'test');
  assert.ok(Object.keys(input.files).some((p) => p.endsWith('_test/Cargo.toml')), 'rust workspace is materialised');

  await new Promise((r2) => setImmediate(r2));
  await new Promise((r2) => setImmediate(r2));
  const list = await call('/api/rust/progress', { cookie });
  assert.equal(list.json.progress.find((p: { slug: string }) => p.slug === ex.slug)?.status, 'passed');
  const att = await call(`/api/rust/exercises/${ex.slug}/attempts`, { cookie });
  assert.equal(att.json.attempts[0].outcome, 'passed');
});

test('arguments are refused for an exercise that takes none', async () => {
  const ex = listExercises('rust').find((e) => !e.argv);
  if (!ex) return;
  const cookie = await devLogin('arger');
  const r = await call(`/api/rust/exercises/${ex.slug}/run`, { method: 'POST', cookie, body: { args: ['x'] } });
  assert.equal(r.status, 400);
});

test('a cooldown from the dispatcher is a 429 with Retry-After', async () => {
  const ex = listExercises('rust')[0]!;
  const cookie = await devLogin('cooler');
  setRunnerModule({
    submitRun() {
      const e = new Error('cooling') as Error & { secondsRemaining: number };
      e.name = 'CooldownError';
      e.secondsRemaining = 12;
      throw e;
    },
  });
  try {
    const r = await call(`/api/rust/exercises/${ex.slug}/run`, { method: 'POST', cookie, body: {} });
    assert.equal(r.status, 429);
    assert.equal(r.json.secondsRemaining, 12);
  } finally {
    setRunnerModule({ submitRun: () => 'x', getRun: (id) => fakeRuns.get(id) });
  }
});

test('preferences: defaults, partial update, invalid values ignored, per user (D24)', async () => {
  const a = await devLogin('fake_prefs_a');
  const b = await devLogin('fake_prefs_b');
  assert.equal((await call('/api/preferences')).status, 401);

  const first = await call('/api/preferences', { cookie: a });
  assert.equal(first.status, 200);
  assert.deepEqual(first.json.preferences, { fontSize: 13, tabSize: 4, wordWrap: false, keybindings: 'default' });

  const put = await call('/api/preferences', { method: 'PUT', cookie: a, body: { theme: 'light', fontSize: 99, tabSize: 2, evil: 1 } });
  assert.equal(put.status, 200);
  assert.deepEqual(put.json.preferences, { fontSize: 13, tabSize: 2, wordWrap: false, keybindings: 'default' });

  const again = await call('/api/preferences', { method: 'PUT', cookie: a, body: { keybindings: 'vim' } });
  assert.equal(again.json.preferences.tabSize, 2);
  assert.equal('theme' in again.json.preferences, false); // dark only (D25)
  assert.equal(again.json.preferences.keybindings, 'vim');

  assert.equal((await call('/api/preferences', { cookie: b })).json.preferences.keybindings, 'default');
});

test('dashboard and history: per-track totals, recent activity, filters, paging, ownership', async () => {
  const a = await devLogin('fake_hist_a');
  const b = await devLogin('fake_hist_b');
  const ua = users.upsertOnLogin('fake_hist_a', null, null);
  const goSlug = listExercises('go')[0]!.slug;
  const rsSlug = listExercises('rust')[0]!.slug;
  progress.save(ua.id, 'go', goSlug, { status: 'passed' });
  for (let i = 0; i < 3; i++) {
    attempts.record({ userId: ua.id, language: 'go', slug: goSlug, kind: 'run', outcome: 'failed', exitCode: 1, durationMs: 10, files: { 'main.go': `v${i}` }, output: `out${i}` });
  }
  attempts.record({ userId: ua.id, language: 'go', slug: goSlug, kind: 'test', outcome: 'passed', exitCode: 0, durationMs: 20, files: { 'main.go': 'ok' }, output: 'PASS' });
  attempts.record({ userId: ua.id, language: 'rust', slug: rsSlug, kind: 'test', outcome: 'failed', exitCode: 1, durationMs: 30 });

  const d = await call('/api/dashboard', { cookie: a });
  assert.equal(d.status, 200);
  const go = d.json.tracks.find((t: any) => t.language === 'go');
  assert.equal(go.passed, 1);
  assert.equal(go.total, listExercises('go').length);
  assert.equal(go.resume.slug, goSlug);
  assert.equal(go.runs, 3);
  assert.equal(go.submits, 1);
  assert.equal(go.submitsPassed, 1);
  assert.ok(go.gates.length > 0 && go.gates.some((g: any) => g.passed === 1));
  assert.equal(d.json.recent.length, 5);
  assert.equal(d.json.recent[0].language, 'rust');

  const page1 = await call('/api/history?limit=2', { cookie: a });
  assert.equal(page1.json.attempts.length, 2);
  assert.ok(page1.json.next);
  const page2 = await call(`/api/history?limit=2&before=${page1.json.next}`, { cookie: a });
  assert.equal(page2.json.attempts.length, 2);
  assert.ok(page2.json.attempts[0].id < page1.json.attempts[1].id);
  const onlyTests = await call('/api/history?kind=test&language=go', { cookie: a });
  assert.equal(onlyTests.json.attempts.length, 1);
  assert.equal(onlyTests.json.next, null);
  assert.equal((await call('/api/history?language=cobol', { cookie: a })).status, 400);

  const id = onlyTests.json.attempts[0].id;
  const det = await call(`/api/history/${id}`, { cookie: a });
  assert.equal(det.status, 200);
  assert.deepEqual(det.json.files, { 'main.go': 'ok' });
  assert.equal(det.json.output, 'PASS');
  // Another student cannot read it, and sees none of it in their history.
  assert.equal((await call(`/api/history/${id}`, { cookie: b })).status, 404);
  assert.equal((await call('/api/history', { cookie: b })).json.attempts.length, 0);
  assert.equal((await call('/api/dashboard')).status, 401);
});

test('vault and exercise report: passing copy, Markdown download, ownership', async () => {
  const a = await devLogin('fake_vault_a');
  const b = await devLogin('fake_vault_b');
  const ua = users.upsertOnLogin('fake_vault_a', null, null);
  const ex = listExercises('rust').find((e) => e.kind === 'lib') ?? listExercises('rust')[0]!;
  const sol = 'pub fn answer() -> u8 { 42 }\n// ``` inside code\n';
  snapshots.savePassing(ua.id, 'rust', ex.slug, { 'src/lib.rs': sol, 'src/main.rs': 'fn main() {}' });
  attempts.record({ userId: ua.id, language: 'rust', slug: ex.slug, kind: 'test', outcome: 'passed', exitCode: 0, durationMs: 5 });

  const v = await call('/api/vault', { cookie: a });
  assert.equal(v.status, 200);
  assert.equal(v.json.items.length, 1);
  assert.equal(v.json.items[0].slug, ex.slug);
  assert.equal((await call('/api/vault', { cookie: b })).json.items.length, 0);

  const r = await fetch(`${base}/api/rust/exercises/${ex.slug}/report`, { headers: { cookie: a } });
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-type') ?? '', /text\/markdown/);
  assert.match(r.headers.get('content-disposition') ?? '', new RegExp(`rust-${ex.slug}\\.md`));
  const md = await r.text();
  assert.match(md, /## Subject/);
  assert.match(md, /## Solution/);
  assert.ok(md.includes('pub fn answer()'));
  assert.ok(md.includes('````rust'), 'fence grows past backticks in the code');
  assert.match(md, /last passing copy/);
  // Another student gets their own (empty) draft, never this solution.
  const rb = await (await fetch(`${base}/api/rust/exercises/${ex.slug}/report`, { headers: { cookie: b } })).text();
  assert.ok(!rb.includes('pub fn answer()'));
  assert.equal((await fetch(`${base}/api/rust/exercises/${ex.slug}/report`)).status, 401);
  assert.equal((await fetch(`${base}/api/rust/exercises/no_such_thing/report`, { headers: { cookie: a } })).status, 404);
});

test('stars are private, toggle, and show in the exercise list with status', async () => {
  const a = await devLogin('fake_star_a');
  const b = await devLogin('fake_star_b');
  const slug = listExercises('js')[0]!.slug;
  assert.equal((await call(`/api/js/exercises/${slug}/star`, { method: 'PUT', cookie: a })).status, 200);
  assert.equal((await call(`/api/js/exercises/${slug}/star`, { method: 'PUT', cookie: a })).status, 200);
  const la = await call('/api/js/exercises', { cookie: a });
  const ea = la.json.exercises.find((e: any) => e.slug === slug);
  assert.equal(ea.starred, true);
  assert.equal(ea.status, 'not_started');
  const lb = await call('/api/js/exercises', { cookie: b });
  assert.equal(lb.json.exercises.find((e: any) => e.slug === slug).starred, false);
  await call(`/api/js/exercises/${slug}/star`, { method: 'DELETE', cookie: a });
  assert.equal((await call('/api/js/exercises', { cookie: a })).json.exercises.find((e: any) => e.slug === slug).starred, false);
  assert.equal((await call('/api/js/exercises/no_such/star', { method: 'PUT', cookie: a })).status, 404);
  assert.equal((await call(`/api/js/exercises/${slug}/star`, { method: 'PUT' })).status, 401);
});
