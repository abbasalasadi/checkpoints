/**
 * Data access. The only place SQL appears — handlers and services never touch
 * the database directly (docs/01-canonical.md, separation of responsibilities).
 *
 * Every read and write is scoped by user_id. A caller cannot ask for another
 * student's row, because there is no function here that would let them.
 */

import { createHash, randomBytes } from 'node:crypto';
import { getDb } from '../db/index.js';
import type { Language } from '../languages.js';

const now = () => new Date().toISOString();

// ── users ────────────────────────────────────────────────────────────────────

export interface User {
  id: number;
  identifier_normalized: string;
  reboot_user_id: string | null;
  claims_json: string | null;
  created_at: string;
  last_login_at: string;
}

export const users = {
  /**
   * Upsert by the identifier the student typed — always available, because the
   * backend performed the signin itself. reboot_user_id and claims are recorded
   * opportunistically and never gate anything.
   */
  upsertOnLogin(identifier: string, rebootUserId: string | null, claims: unknown): User {
    const db = getDb();
    const key = identifier.trim().toLowerCase();
    const ts = now();
    const claimsJson = claims === null || claims === undefined ? null : JSON.stringify(claims);

    db.prepare(
      `INSERT INTO users (identifier_normalized, reboot_user_id, claims_json, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(identifier_normalized) DO UPDATE SET
         last_login_at  = excluded.last_login_at,
         claims_json    = excluded.claims_json,
         reboot_user_id = COALESCE(excluded.reboot_user_id, users.reboot_user_id)`,
    ).run(key, rebootUserId, claimsJson, ts, ts);

    return db.prepare('SELECT * FROM users WHERE identifier_normalized = ?').get(key) as User;
  },

  byId(id: number): User | undefined {
    return getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
  },
};

// ── sessions ─────────────────────────────────────────────────────────────────

/** The DB holds only SHA-256(token) (D6): a leaked database is not a set of live cookies. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface Session {
  token_hash: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  last_seen_at: string;
}

export const sessions = {
  /** Returns the raw token (for the cookie) — it is never stored. */
  create(userId: number, ttlHours: number, userAgent: string | null): { token: string; session: Session } {
    const db = getDb();
    // 256 bits. Deliberately not a JWT: a server-side row makes revocation immediate.
    const token = randomBytes(32).toString('base64url');
    const hash = hashToken(token);
    const ts = now();
    const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, revoked_at, user_agent, last_seen_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    ).run(hash, userId, ts, expires, userAgent, ts);
    const session = db.prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hash) as Session;
    return { token, session };
  },

  /** By raw token. Only if it exists, is unrevoked, and has not expired. */
  findValid(token: string): Session | undefined {
    const row = getDb().prepare('SELECT * FROM sessions WHERE token_hash = ?').get(hashToken(token)) as
      | Session
      | undefined;
    if (!row) return undefined;
    if (row.revoked_at !== null) return undefined;
    if (new Date(row.expires_at).getTime() <= Date.now()) return undefined;
    return row;
  },

  touch(tokenHash: string): void {
    getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(now(), tokenHash);
  },

  /** Revokes one session (by hash) — not every session the student holds. */
  revoke(tokenHash: string): void {
    getDb()
      .prepare('UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL')
      .run(now(), tokenHash);
  },
};

// ── progress ─────────────────────────────────────────────────────────────────

type Files = Record<string, string>;

interface ProgressRow {
  user_id: number;
  language: Language;
  exercise_slug: string;
  files_json: string | null;
  status: 'in_progress' | 'passed';
  updated_at: string;
}

export interface Progress extends Omit<ProgressRow, 'files_json'> {
  /** null = never saved, or reset: serve the starter. */
  files: Files | null;
}

const parseFiles = (json: string | null): Files | null => (json === null ? null : (JSON.parse(json) as Files));
const toProgress = (r: ProgressRow): Progress => {
  const { files_json, ...rest } = r;
  return { ...rest, files: parseFiles(files_json) };
};

export const progress = {
  listForUser(userId: number, language: Language): Progress[] {
    return (
      getDb().prepare('SELECT * FROM progress WHERE user_id = ? AND language = ?').all(userId, language) as ProgressRow[]
    ).map(toProgress);
  },

  /** Scoped to the caller. There is no "get anyone's progress" function. */
  get(userId: number, language: Language, slug: string): Progress | undefined {
    const row = getDb()
      .prepare('SELECT * FROM progress WHERE user_id = ? AND language = ? AND exercise_slug = ?')
      .get(userId, language, slug) as ProgressRow | undefined;
    return row ? toProgress(row) : undefined;
  },

  /** Clear the saved code; `status` is left alone — the pass still counts. */
  clearCode(userId: number, language: Language, slug: string): void {
    getDb()
      .prepare(
        `UPDATE progress SET files_json = NULL, updated_at = ?
          WHERE user_id = ? AND language = ? AND exercise_slug = ?`,
      )
      .run(now(), userId, language, slug);
  },

  /**
   * Explicit allow-list: only files and status are writable. user_id comes from
   * the session, never the request body. Saved files are merged over existing.
   */
  save(userId: number, language: Language, slug: string, fields: { files?: Files | null; status?: 'in_progress' | 'passed' }): Progress {
    const existing = progress.get(userId, language, slug);
    const files =
      fields.files === undefined
        ? (existing?.files ?? null)
        : fields.files === null
          ? null
          : { ...(existing?.files ?? {}), ...fields.files };
    const status = fields.status ?? existing?.status ?? 'in_progress';

    getDb()
      .prepare(
        `INSERT INTO progress (user_id, language, exercise_slug, files_json, status, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, language, exercise_slug) DO UPDATE SET
           files_json = excluded.files_json, status = excluded.status, updated_at = excluded.updated_at`,
      )
      .run(userId, language, slug, files === null ? null : JSON.stringify(files), status, now());

    return progress.get(userId, language, slug)!;
  },
};

// ── snapshots ────────────────────────────────────────────────────────────────

export type SnapshotKind = 'manual' | 'passing';

interface SnapshotRow {
  id: number;
  user_id: number;
  language: Language;
  exercise_slug: string;
  kind: SnapshotKind;
  files_json: string;
  created_at: string;
}

export interface Snapshot extends Omit<SnapshotRow, 'files_json'> {
  files: Files;
}

const toSnapshot = (r: SnapshotRow): Snapshot => {
  const { files_json, ...rest } = r;
  return { ...rest, files: JSON.parse(files_json) as Files };
};

/** How many manual saves to keep before the oldest is dropped. */
const MANUAL_KEEP = 3;

export const snapshots = {
  saveManual(userId: number, language: Language, slug: string, files: Files): Snapshot {
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO snapshots (user_id, language, exercise_slug, kind, files_json, created_at)
         VALUES (?, ?, ?, 'manual', ?, ?)`,
      )
      .run(userId, language, slug, JSON.stringify(files), now());

    db.prepare(
      `DELETE FROM snapshots
        WHERE user_id = ? AND language = ? AND exercise_slug = ? AND kind = 'manual'
          AND id NOT IN (
            SELECT id FROM snapshots
             WHERE user_id = ? AND language = ? AND exercise_slug = ? AND kind = 'manual'
             ORDER BY created_at DESC, id DESC LIMIT ?
          )`,
    ).run(userId, language, slug, userId, language, slug, MANUAL_KEEP);

    return toSnapshot(db.prepare('SELECT * FROM snapshots WHERE id = ?').get(info.lastInsertRowid) as SnapshotRow);
  },

  /** The code that just passed, replacing any earlier passing copy. */
  savePassing(userId: number, language: Language, slug: string, files: Files): void {
    const db = getDb();
    db.transaction(() => {
      db.prepare(
        `DELETE FROM snapshots WHERE user_id = ? AND language = ? AND exercise_slug = ? AND kind = 'passing'`,
      ).run(userId, language, slug);
      db.prepare(
        `INSERT INTO snapshots (user_id, language, exercise_slug, kind, files_json, created_at)
         VALUES (?, ?, ?, 'passing', ?, ?)`,
      ).run(userId, language, slug, JSON.stringify(files), now());
    })();
  },

  /** Newest first. Scoped to the caller. */
  list(userId: number, language: Language, slug: string): Snapshot[] {
    return (
      getDb()
        .prepare(
          `SELECT * FROM snapshots WHERE user_id = ? AND language = ? AND exercise_slug = ?
            ORDER BY created_at DESC, id DESC`,
        )
        .all(userId, language, slug) as SnapshotRow[]
    ).map(toSnapshot);
  },

  /** Every passing copy the student holds, newest first (the solutions vault). */
  passingAll(userId: number): Snapshot[] {
    return (
      getDb()
        .prepare(`SELECT * FROM snapshots WHERE user_id = ? AND kind = 'passing' ORDER BY created_at DESC, id DESC`)
        .all(userId) as SnapshotRow[]
    ).map(toSnapshot);
  },

  passing(userId: number, language: Language, slug: string): Snapshot | undefined {
    const row = getDb()
      .prepare(`SELECT * FROM snapshots WHERE user_id = ? AND language = ? AND exercise_slug = ? AND kind = 'passing' ORDER BY id DESC LIMIT 1`)
      .get(userId, language, slug) as SnapshotRow | undefined;
    return row ? toSnapshot(row) : undefined;
  },

  /** Undefined for another student's snapshot, so it reads as missing. */
  byId(userId: number, id: number): Snapshot | undefined {
    const row = getDb().prepare('SELECT * FROM snapshots WHERE id = ? AND user_id = ?').get(id, userId) as
      | SnapshotRow
      | undefined;
    return row ? toSnapshot(row) : undefined;
  },
};

// ── attempts and runner usage ────────────────────────────────────────────────

/** D5: attempt output is kept up to 1 MB. */
export const ATTEMPT_OUTPUT_MAX_BYTES = 1024 * 1024;

function capUtf8(text: string, maxBytes: number): string {
  const buf = Buffer.from(text, 'utf8');
  return buf.length <= maxBytes ? text : buf.subarray(0, maxBytes).toString('utf8');
}

export interface AttemptInput {
  userId: number;
  language: Language;
  slug: string;
  runId?: string | null;
  kind: 'run' | 'test';
  outcome?: string | null;
  exitCode: number | null;
  durationMs: number | null;
  files?: Files | null;
  output?: string | null;
}

export const attempts = {
  record(a: AttemptInput): void {
    getDb()
      .prepare(
        `INSERT INTO attempts
           (user_id, language, exercise_slug, run_id, kind, outcome, exit_code, duration_ms, files_json, output, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        a.userId,
        a.language,
        a.slug,
        a.runId ?? null,
        a.kind,
        a.outcome ?? null,
        a.exitCode,
        a.durationMs,
        a.files ? JSON.stringify(a.files) : null,
        a.output == null ? null : capUtf8(a.output, ATTEMPT_OUTPUT_MAX_BYTES),
        now(),
      );
  },

  listForExercise(userId: number, language: Language, slug: string, limit = 20) {
    return getDb()
      .prepare(
        `SELECT id, run_id, kind, outcome, exit_code, duration_ms, created_at FROM attempts
          WHERE user_id = ? AND language = ? AND exercise_slug = ?
          ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(userId, language, slug, limit);
  },

  /** Latest attempts across every track (dashboard recent activity). */
  recent(userId: number, limit = 10): AttemptRow[] {
    return getDb()
      .prepare(
        `SELECT id, language, exercise_slug, kind, outcome, duration_ms, created_at FROM attempts
          WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT ?`,
      )
      .all(userId, limit) as AttemptRow[];
  },

  /** Attempt counts by language, kind and outcome (dashboard statistics). */
  counts(userId: number): { language: Language; kind: string; outcome: string | null; n: number }[] {
    return getDb()
      .prepare(
        `SELECT language, kind, outcome, COUNT(*) AS n FROM attempts
          WHERE user_id = ? GROUP BY language, kind, outcome`,
      )
      .all(userId) as { language: Language; kind: string; outcome: string | null; n: number }[];
  },

  /**
   * History explorer (V2 feature 2): newest first, optional filters, keyset
   * paging by id (`before`), so a page never shifts while new runs land.
   */
  search(userId: number, f: AttemptFilter): AttemptRow[] {
    const where = ['user_id = ?'];
    const args: (string | number)[] = [userId];
    if (f.language) { where.push('language = ?'); args.push(f.language); }
    if (f.slug) { where.push('exercise_slug = ?'); args.push(f.slug); }
    if (f.kind) { where.push('kind = ?'); args.push(f.kind); }
    if (f.outcome) { where.push('outcome = ?'); args.push(f.outcome); }
    if (f.before) { where.push('id < ?'); args.push(f.before); }
    args.push(f.limit);
    return getDb()
      .prepare(
        `SELECT id, language, exercise_slug, kind, outcome, duration_ms, created_at FROM attempts
          WHERE ${where.join(' AND ')} ORDER BY id DESC LIMIT ?`,
      )
      .all(...args) as AttemptRow[];
  },

  /** One attempt with its code and output; undefined unless it is the caller's. */
  detail(userId: number, id: number): (AttemptRow & { exit_code: number | null; files_json: string | null; output: string | null }) | undefined {
    return getDb()
      .prepare(
        `SELECT id, language, exercise_slug, kind, outcome, exit_code, duration_ms, files_json, output, created_at
           FROM attempts WHERE user_id = ? AND id = ?`,
      )
      .get(userId, id) as (AttemptRow & { exit_code: number | null; files_json: string | null; output: string | null }) | undefined;
  },
};

export interface AttemptRow {
  id: number;
  language: Language;
  exercise_slug: string;
  kind: string;
  outcome: string | null;
  duration_ms: number | null;
  created_at: string;
}

export interface AttemptFilter {
  language?: Language;
  slug?: string;
  kind?: 'run' | 'test';
  outcome?: string;
  before?: number;
  limit: number;
}

export const runnerUsage = {
  open(userId: number, containerId: string): number {
    const info = getDb()
      .prepare('INSERT INTO runner_usage (user_id, container_id, started_at) VALUES (?, ?, ?)')
      .run(userId, containerId, now());
    return Number(info.lastInsertRowid);
  },

  close(containerId: string): void {
    getDb()
      .prepare(
        `UPDATE runner_usage
            SET ended_at = ?,
                seconds  = CAST((julianday(?) - julianday(started_at)) * 86400 AS INTEGER)
          WHERE container_id = ? AND ended_at IS NULL`,
      )
      .run(now(), now(), containerId);
  },
};

// ── preferences ──────────────────────────────────────────────────────────────

export const preferences = {
  /** The stored JSON, parsed; null when the user never saved any. */
  get(userId: number): unknown {
    const row = getDb().prepare('SELECT prefs_json FROM preferences WHERE user_id = ?').get(userId) as
      | { prefs_json: string }
      | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.prefs_json);
    } catch {
      return null;
    }
  },

  set(userId: number, prefs: unknown): void {
    getDb()
      .prepare(
        `INSERT INTO preferences (user_id, prefs_json, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET prefs_json = excluded.prefs_json, updated_at = excluded.updated_at`,
      )
      .run(userId, JSON.stringify(prefs), now());
  },
};

// ── stars ─────────────────────────────────────────────────────────────────────

/** Private bookmarks (V2, D24): scoped to the caller like everything else. */
export const stars = {
  list(userId: number, language: Language): string[] {
    return (
      getDb().prepare('SELECT exercise_slug FROM stars WHERE user_id = ? AND language = ?').all(userId, language) as { exercise_slug: string }[]
    ).map((r) => r.exercise_slug);
  },
  set(userId: number, language: Language, slug: string, on: boolean): void {
    const db = getDb();
    if (on) {
      db.prepare('INSERT OR IGNORE INTO stars (user_id, language, exercise_slug, created_at) VALUES (?, ?, ?, ?)').run(userId, language, slug, now());
    } else {
      db.prepare('DELETE FROM stars WHERE user_id = ? AND language = ? AND exercise_slug = ?').run(userId, language, slug);
    }
  },
};
