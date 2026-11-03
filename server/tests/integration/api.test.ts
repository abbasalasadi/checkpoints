/**
 * API integration tests, run against a REAL SQLite file rather than mocks —
 * a mocked repository would test the mock, not the ownership rules.
 *
 * These cover the abuse paths the plan requires: one student must not be able
 * to read or write another's work, and every rejection path must reject.
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { closeDatabase, migrate, openDatabase } from '../../src/db/index.ts';
import { progress, sessions, users } from '../../src/repositories/index.ts';

let dir: string;

before(() => {
  dir = mkdtempSync(join(tmpdir(), 'rc-test-'));
  openDatabase(join(dir, 'test.db'));
  migrate();
});

after(() => {
  closeDatabase();
  rmSync(dir, { recursive: true, force: true });
});

test('migrations are idempotent — a second run applies nothing', () => {
  const again = migrate();
  assert.equal(again.length, 0, 'a warm start must apply no migrations');
});

test('identity is keyed on the identifier, not on a JWT claim', () => {
  // reboot_user_id is null here: the claim name is unknown and must not matter.
  const u = users.upsertOnLogin('  StudentOne  ', null, null);
  assert.equal(u.identifier_normalized, 'studentone', 'trimmed and lowercased');
  assert.equal(u.reboot_user_id, null);

  // Same student, different casing, later login -> same row, not a duplicate.
  const again = users.upsertOnLogin('STUDENTONE', null, { sub: '42' });
  assert.equal(again.id, u.id, 'must not create a second user');
});

test('a reboot user id is adopted once seen, and never lost afterwards', () => {
  users.upsertOnLogin('claimy', 'reboot-99', { sub: 'reboot-99' });
  const withClaim = users.upsertOnLogin('claimy', null, null);
  assert.equal(withClaim.reboot_user_id, 'reboot-99', 'a later login without the claim must not erase it');
});

test('progress is scoped to its owner — one student cannot see another', () => {
  const alice = users.upsertOnLogin('alice', null, null);
  const bob = users.upsertOnLogin('bob', null, null);

  progress.save(alice.id, 'min_and_max', { libRs: 'alice code' });

  assert.equal(progress.get(alice.id, 'min_and_max')?.lib_rs, 'alice code');
  // Bob asking for the same slug gets nothing — the handler turns this into a
  // 404, so the row's existence is never revealed.
  assert.equal(progress.get(bob.id, 'min_and_max'), undefined);
});

test("saving progress cannot overwrite another student's row", () => {
  const alice = users.upsertOnLogin('alice', null, null);
  const bob = users.upsertOnLogin('bob', null, null);

  progress.save(bob.id, 'min_and_max', { libRs: 'bob code' });

  assert.equal(progress.get(alice.id, 'min_and_max')?.lib_rs, 'alice code', "alice's row is untouched");
  assert.equal(progress.get(bob.id, 'min_and_max')?.lib_rs, 'bob code');
});

test('expired sessions are rejected', () => {
  const u = users.upsertOnLogin('expiry', null, null);
  const s = sessions.create(u.id, -1, null); // already expired
  assert.equal(sessions.findValid(s.id), undefined);
});

test('revoked sessions are rejected, and revocation affects only that session', () => {
  const u = users.upsertOnLogin('revoker', null, null);
  const first = sessions.create(u.id, 12, 'device-a');
  const second = sessions.create(u.id, 12, 'device-b');

  sessions.revoke(first.id);

  assert.equal(sessions.findValid(first.id), undefined, 'revoked session is dead');
  assert.ok(sessions.findValid(second.id), 'the other device stays signed in');
});

test('an unknown session id is rejected', () => {
  assert.equal(sessions.findValid('not-a-real-session'), undefined);
});
