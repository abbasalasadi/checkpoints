/**
 * SQLite connection and the migration runner.
 *
 * Migrations run at EVERY server start (docs/01-canonical.md): ordered files,
 * each applied in a transaction, recorded in schema_migrations. Already-applied
 * ones are skipped, so startup is idempotent. Any failure aborts startup — a
 * half-migrated schema must never serve traffic.
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/index.js';
import { logger } from '../logger.js';

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), 'migrations');

export type Db = Database.Database;

let db: Db | null = null;

export function getDb(): Db {
  if (!db) throw new Error('database not opened — call openDatabase() first');
  return db;
}

export function openDatabase(path = config.dbPath): Db {
  mkdirSync(dirname(path), { recursive: true });
  const handle = new Database(path);
  // WAL lets readers run alongside a writer, which is what makes many students
  // browsing while one saves progress a non-issue.
  handle.pragma('journal_mode = WAL');
  handle.pragma('foreign_keys = ON');
  handle.pragma('busy_timeout = 5000');
  db = handle;
  return handle;
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}

/**
 * Apply every pending migration in filename order.
 * Returns the versions applied during this call (empty on a warm start).
 */
export function migrate(handle: Db = getDb()): string[] {
  handle.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version    TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )`);

  const applied = new Set(
    handle.prepare('SELECT version FROM schema_migrations').all().map((r) => (r as { version: string }).version),
  );

  // Returning [] here silently produced a database holding nothing but
  // schema_migrations: tsc does not copy .sql, so the deployed bundle resolved
  // this path to a directory that did not exist, logged "applied 0" and served
  // traffic with no users table. A missing or empty directory is a broken
  // build, and startup must stop rather than come up with no schema.
  if (!existsSync(MIGRATIONS_DIR)) {
    throw new Error(`migrations directory not found: ${MIGRATIONS_DIR} — the build did not copy src/db/migrations into dist`);
  }
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    throw new Error(`no .sql migrations in ${MIGRATIONS_DIR} — refusing to start with an unmigrated database`);
  }

  const justApplied: string[] = [];
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    // One transaction per migration: a failure leaves the schema untouched
    // rather than half-applied.
    const run = handle.transaction(() => {
      handle.exec(sql);
      handle
        .prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(version, new Date().toISOString());
    });

    // SQLite's table-rebuild procedure (007): foreign keys off while a table is
    // copied and swapped, so rows already in the database move over unchanged.
    // The pragma is a no-op inside a transaction, so it wraps it.
    const fk = handle.pragma('foreign_keys', { simple: true });
    handle.pragma('foreign_keys = OFF');
    try {
      run();
    } catch (err) {
      logger.error('db.migration.failed', { version, error: String(err) });
      throw new Error(`migration ${version} failed: ${String(err)}`);
    } finally {
      handle.pragma(`foreign_keys = ${fk ? 'ON' : 'OFF'}`);
    }
    // Rows whose parent is gone are kept, not dropped, but they are counted.
    const orphans = (handle.pragma('foreign_key_check') as unknown[]).length;
    if (orphans) logger.warn('db.migration.orphans', { version, rows: orphans });

    justApplied.push(version);
    logger.info('db.migration.applied', { version });
  }

  return justApplied;
}
