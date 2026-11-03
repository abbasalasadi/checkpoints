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
const REQUIRED_TABLES = ['users', 'sessions', 'progress', 'snapshots'];

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
