#!/usr/bin/env node
// (LOCAL / VM, one-off) Merge the three reference databases into the unified DB.
//
//   node scripts/migrate/merge-dbs.mjs --go go.db --js js.db --rust rust.db --out new.db
//          [--migrations server/src/db/migrations] [--dry-run]
//
// - Sources are opened READ-ONLY. --out must not exist: the target is created
//   from the unified migrations (the same .sql files the server applies), so the
//   schema always matches what the server expects.
// - Users are matched on identifier_normalized (the username). The earliest
//   created_at and the latest last_login_at win; reboot_user_id / claims_json are
//   taken from the most recent login that has them.
// - Copied: users, progress (drafts), snapshots, attempts. Every exercise-keyed
//   row gets `language`. NOT copied: sessions (students sign in again; token
//   storage changed to SHA-256, D6) and runner_usage (operational, Rust only).
// - Column mapping is driven by the TARGET's columns (PRAGMA table_info), so the
//   script follows the server's migrations rather than hard-coding them. A target
//   column the script cannot fill is left to its DEFAULT; if it is NOT NULL with
//   no default the run aborts and names it.
// - Rust stores code as lib_rs / main_rs; Go and JS as files_json. Whichever
//   form the target uses is produced from whichever form the source has.
// - The whole merge is one transaction: it either lands completely or not at all.
import { createRequire } from 'node:module';
import { existsSync, readdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
// better-sqlite3 comes from the server workspace (npm ci); fall back to the
// caller's cwd so the script also runs from a directory with its own install.
function loadSqlite() {
  for (const base of [join(ROOT, 'server/package.json'), join(ROOT, 'package.json'), join(process.cwd(), 'noop.js')]) {
    try { return createRequire(base)('better-sqlite3'); } catch { /* next */ }
  }
  console.error('[ERROR] better-sqlite3 not found — run `make setup` (npm ci) first');
  process.exit(1);
}
const Database = loadSqlite();

const LANGS = ['go', 'js', 'rust'];
// Rust file names inside files_json. Matches the Rust exercise layout
// (src/lib.rs for a library exercise, src/main.rs for a binary one).
const RUST_FILE = { lib_rs: 'src/lib.rs', main_rs: 'src/main.rs' };

function parseArgs(argv) {
  const a = { migrations: join(ROOT, 'server/src/db/migrations'), dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--dry-run') { a.dryRun = true; continue; }
    if (k === '-h' || k === '--help') usage(0);
    const v = argv[++i];
    if (!v) usage(1, `missing value for ${k}`);
    if (k === '--go' || k === '--js' || k === '--rust') a[k.slice(2)] = v;
    else if (k === '--out') a.out = v;
    else if (k === '--migrations') a.migrations = v;
    else usage(1, `unknown argument ${k}`);
  }
  if (!a.out) usage(1, '--out is required');
  if (!LANGS.some((l) => a[l])) usage(1, 'give at least one of --go / --js / --rust');
  return a;
}

function usage(code, msg) {
  if (msg) console.error(`[ERROR] ${msg}`);
  console.error('usage: merge-dbs.mjs --go <db> --js <db> --rust <db> --out <new db> [--migrations dir] [--dry-run]');
  process.exit(code);
}

const die = (m) => { console.error(`[ERROR] ${m}`); process.exit(1); };

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all();
}
function hasTable(db, table) {
  return !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
}

function applyMigrations(db, dir) {
  if (!existsSync(dir)) die(`migrations dir not found: ${dir}`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  if (!files.length) die(`no .sql files in ${dir}`);
  // Same bookkeeping as server/src/db/index.ts migrate(), so the server sees
  // these as applied and does not run them again on first start.
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)');
  const now = new Date().toISOString();
  for (const f of files) {
    db.exec(readFileSync(join(dir, f), 'utf8'));
    db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(f.replace(/\.sql$/, ''), now);
  }
  return files;
}

// files_json  <->  lib_rs/main_rs
function filesOf(row) {
  if (row.files_json != null) {
    try { return JSON.parse(row.files_json); } catch { return { __raw: row.files_json }; }
  }
  const files = {};
  for (const [col, name] of Object.entries(RUST_FILE)) if (row[col] != null) files[name] = row[col];
  return files;
}

// The value for one target column, given the source row. undefined = not mapped.
function valueFor(col, row, ctx) {
  switch (col) {
    case 'language': return ctx.lang;
    case 'user_id': return ctx.userId;
    case 'files_json': {
      // No code in the source (old attempts; Rust rows with both columns NULL,
      // meaning "starter") -> NULL, which the target reads as "none / starter".
      if (row.files_json != null) return row.files_json;
      const f = filesOf(row);
      return Object.keys(f).length ? JSON.stringify(f) : null;
    }
    case 'lib_rs': case 'main_rs':
      if (col in row) return row[col];
      { const f = filesOf(row); return f[RUST_FILE[col]] ?? null; }
    // attempts: Rust kind run|test, Go/JS mode run|submit. Snapshots keep kind.
    case 'mode': return row.mode ?? (row.kind === 'test' ? 'submit' : row.kind);
    case 'kind':
      if (ctx.table === 'attempts' && row.kind === undefined) return row.mode === 'submit' ? 'test' : row.mode;
      return row.kind ?? row.mode;
    // progress.status: target vocabulary is in_progress | passed (Rust). Go's
    // 'untouched' and JS's 'attempted' both mean "not passed yet".
    case 'status':
      if (!('status' in row)) return undefined;
      return row.status === 'passed' ? 'passed' : 'in_progress';
    default: return col in row ? row[col] : undefined;
  }
}

function copyTable(src, dst, table, ctx, report) {
  if (!hasTable(src, table)) return;
  if (!hasTable(dst, table)) { report.warn.push(`${ctx.lang}: target has no table ${table}; skipped`); return; }
  const tcols = columns(dst, table);
  const userMap = ctx.userMap;
  let n = 0;
  const rows = src.prepare(`SELECT * FROM ${table}`).all();
  for (const row of rows) {
    const userId = userMap.get(row.user_id);
    if (userId === undefined) { report.warn.push(`${ctx.lang}.${table}: orphan row for user ${row.user_id}; skipped`); continue; }
    const names = []; const vals = [];
    for (const c of tcols) {
      if (c.name === 'id' && c.pk) continue;              // fresh ids: ranges collide across sources
      const v = valueFor(c.name, row, { ...ctx, userId, table });
      if (v === undefined) {
        if (c.notnull && c.dflt_value == null) die(`${table}.${c.name} is NOT NULL with no default and no source value (${ctx.lang})`);
        continue;
      }
      names.push(c.name); vals.push(v);
    }
    const sql = `INSERT INTO ${table} (${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`;
    try { dst.prepare(sql).run(...vals); n++; }
    catch (e) {
      if (String(e.code).startsWith('SQLITE_CONSTRAINT')) report.warn.push(`${ctx.lang}.${table}: ${e.message}; row skipped`);
      else throw e;
    }
    const unknown = Object.keys(row).filter((k) => !['id', 'user_id', 'lib_rs', 'main_rs', 'files_json', 'kind', 'mode'].includes(k) && !tcols.some((c) => c.name === k));
    for (const k of unknown) report.dropped.add(`${ctx.lang}.${table}.${k}`);
  }
  report.counts[`${ctx.lang}.${table}`] = `${n}/${rows.length}`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (existsSync(args.out)) die(`--out already exists, refusing to overwrite: ${args.out}`);
  for (const l of LANGS) if (args[l] && !existsSync(args[l])) die(`--${l} not found: ${args[l]}`);

  // Built under a temporary name and renamed at the very end, so a failure at
  // any point leaves no half-merged file behind.
  const tmp = `${args.out}.partial`;
  let done = false;
  process.on('exit', () => { if (!done) for (const s of ['', '-wal', '-shm']) rmSync(tmp + s, { force: true }); });
  const dst = new Database(args.dryRun ? ':memory:' : tmp);
  dst.pragma('journal_mode = WAL');
  dst.pragma('foreign_keys = ON');
  const migrations = applyMigrations(dst, args.migrations);

  for (const t of ['progress', 'snapshots', 'attempts']) {
    if (hasTable(dst, t) && !columns(dst, t).some((c) => c.name === 'language')) {
      die(`target table ${t} has no language column — the unified migrations are not in ${args.migrations} yet`);
    }
  }

  const report = { counts: {}, warn: [], dropped: new Set(), users: { merged: 0, created: 0 } };
  const userCols = columns(dst, 'users').map((c) => c.name);

  const merge = dst.transaction(() => {
    for (const lang of LANGS) {
      if (!args[lang]) continue;
      const src = new Database(args[lang], { readonly: true, fileMustExist: true });
      const userMap = new Map();
      for (const u of src.prepare('SELECT * FROM users ORDER BY id').all()) {
        const key = String(u.identifier_normalized).trim().toLowerCase();
        const ex = dst.prepare('SELECT * FROM users WHERE identifier_normalized = ?').get(key);
        if (!ex) {
          const cols = userCols.filter((c) => c !== 'id' && c in u);
          const vals = cols.map((c) => (c === 'identifier_normalized' ? key : c === 'last_login_at' ? (u.last_login_at ?? u.created_at) : u[c]));
          const r = dst.prepare(`INSERT INTO users (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...vals);
          userMap.set(u.id, Number(r.lastInsertRowid));
          report.users.created++;
        } else {
          const newer = (u.last_login_at ?? '') > (ex.last_login_at ?? '');
          let reboot = ex.reboot_user_id;
          if (u.reboot_user_id && !reboot) reboot = u.reboot_user_id;
          else if (u.reboot_user_id && reboot && u.reboot_user_id !== reboot) report.warn.push(`user ${key}: reboot_user_id differs (${lang}); kept the first`);
          dst.prepare(`UPDATE users SET created_at = MIN(created_at, ?), last_login_at = MAX(COALESCE(last_login_at,''), ?),
                       reboot_user_id = ?, claims_json = CASE WHEN ? THEN COALESCE(?, claims_json) ELSE COALESCE(claims_json, ?) END
                       WHERE id = ?`)
            .run(u.created_at, u.last_login_at ?? u.created_at, reboot, newer ? 1 : 0, u.claims_json, u.claims_json, ex.id);
          userMap.set(u.id, ex.id);
          report.users.merged++;
        }
      }
      const ctx = { lang, userMap };
      for (const t of ['progress', 'snapshots', 'attempts']) copyTable(src, dst, t, ctx, report);
      src.close();
    }
  });
  merge();

  const fk = dst.pragma('foreign_key_check');
  if (fk.length) die(`foreign key check failed: ${JSON.stringify(fk.slice(0, 5))}`);
  const ok = dst.pragma('integrity_check', { simple: true });
  if (ok !== 'ok') die(`integrity check: ${ok}`);
  if (!args.dryRun) {
    dst.pragma('wal_checkpoint(TRUNCATE)');
    dst.pragma('journal_mode = DELETE');   // single self-contained file to move
  }
  dst.close();
  if (!args.dryRun) { renameSync(tmp, args.out); }
  done = true;

  console.log(`migrations applied: ${migrations.join(', ')}`);
  console.log(`users: ${report.users.created} created, ${report.users.merged} merged by username`);
  for (const [k, v] of Object.entries(report.counts)) console.log(`  ${k.padEnd(18)} ${v}`);
  if (report.dropped.size) console.log(`source columns with no target column (not copied): ${[...report.dropped].join(', ')}`);
  for (const w of report.warn) console.log(`[WARN] ${w}`);
  console.log(args.dryRun ? 'dry run: nothing written' : `wrote ${args.out}`);
}

main();
