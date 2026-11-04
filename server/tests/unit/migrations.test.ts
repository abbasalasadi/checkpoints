/**
 * Migration tests.
 *
 * These exist because a deploy came up "healthy" with a database that held
 * nothing but schema_migrations. tsc does not copy .sql files, so the compiled
 * bundle resolved its migrations directory to a path that did not exist, and
 * the runner treated that as "no pending migrations" instead of a broken build.
 * The service then served traffic with no users table.
 *
 * So: prove the schema really lands, and prove the built artifact carries the
 * files it needs to build that schema.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, migrate, openDatabase } from '../../src/db/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const serverDir = resolve(here, '../..');

/** Every table the application actually reads or writes. */
const REQUIRED_TABLES = ['users', 'sessions', 'progress', 'snapshots', 'attempts'];

test('migrating a fresh database creates every required table', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-migrate-'));
  try {
    const db = openDatabase(join(dir, 'test.db'));
    const applied = migrate(db);

    assert.ok(applied.length > 0, 'a fresh database must apply at least one migration');

    const tables = new Set(
      db
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
        .all()
        .map((r) => (r as { name: string }).name),
    );
    for (const name of REQUIRED_TABLES) {
      assert.ok(tables.has(name), `missing table after migration: ${name}`);
    }
  } finally {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('migrating twice is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-migrate-'));
  try {
    const db = openDatabase(join(dir, 'test.db'));
    const first = migrate(db);
    const second = migrate(db);

    assert.ok(first.length > 0);
    assert.deepEqual(second, [], 'a warm start must apply nothing');
  } finally {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the build copies migrations next to the compiled code that loads them', () => {
  // src/db/index.ts resolves its migrations relative to its own module, so in a
  // build that means dist/db/migrations. Shipping only src/db/migrations — as
  // the deploy once did — leaves the running service unable to find them.
  const dist = join(serverDir, 'dist/db/migrations');
  if (!existsSync(join(serverDir, 'dist'))) {
    // Nothing built in this checkout; the other tests still cover the schema.
    return;
  }
  assert.ok(existsSync(dist), `built server is missing ${dist} — run the build`);
  const sql = readdirSync(dist).filter((f) => f.endsWith('.sql'));
  assert.ok(sql.length > 0, 'dist/db/migrations contains no .sql files');

  const src = readdirSync(join(serverDir, 'src/db/migrations')).filter((f) => f.endsWith('.sql'));
  assert.deepEqual(sql.sort(), src.sort(), 'dist migrations drifted from source');
});

test('every exercise-keyed table carries a language column', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-migrate-'));
  try {
    const db = openDatabase(join(dir, 'test.db'));
    migrate(db);
    for (const table of ['progress', 'attempts', 'snapshots']) {
      const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((r) => (r as { name: string }).name);
      assert.ok(cols.includes('language'), `${table} has no language column`);
    }
    const sessionCols = db.prepare('PRAGMA table_info(sessions)').all().map((r) => (r as { name: string }).name);
    assert.ok(sessionCols.includes('token_hash'), 'sessions must store the token hash');
    assert.ok(!sessionCols.includes('id'), 'sessions must not store a raw token id');
  } finally {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('007 accepts java, still rejects unknown languages, and keeps rows whose user is gone', () => {
  const dir = mkdtempSync(join(tmpdir(), 'rc-migrate-'));
  try {
    const db = openDatabase(join(dir, 'app.db'));
    migrate(db);
    const now = new Date().toISOString();
    db.prepare("INSERT INTO users (id, identifier_normalized, created_at, last_login_at) VALUES (1, 'u', ?, ?)").run(now, now);
    const put = db.prepare('INSERT INTO progress (user_id, language, exercise_slug, updated_at) VALUES (?, ?, ?, ?)');
    put.run(1, 'java', 'factorial', now);
    assert.throws(() => put.run(1, 'kotlin', 'x', now), /CHECK/);
    // An orphan left by an earlier delete made with foreign keys off (seen in a real database).
    db.pragma('foreign_keys = OFF');
    put.run(99, 'go', 'orphan', now);
    db.pragma('foreign_keys = ON');
    db.prepare("DELETE FROM schema_migrations WHERE version = '007_java'").run();
    assert.deepEqual(migrate(db), ['007_java']);
    assert.equal((db.prepare('SELECT count(*) AS n FROM progress').get() as { n: number }).n, 2);
    assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  } finally {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  }
});
