/**
 * Data access. The only place SQL appears — handlers and services never touch
 * the database directly (docs/01-canonical.md, separation of responsibilities).
 *
 * Every read and write is scoped by user_id. A caller cannot ask for another
 * student's row, because there is no function here that would let them.
 */

import { randomBytes } from 'node:crypto';
import { getDb } from '../db/index.js';

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

export interface Session {
  id: string;
  user_id: number;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  user_agent: string | null;
  last_seen_at: string;
}

export const sessions = {
  create(userId: number, ttlHours: number, userAgent: string | null): Session {
    const db = getDb();
    // 256 bits. Deliberately not a JWT: a server-side row makes revocation
    // immediate, which a stateless token cannot do.
    const id = randomBytes(32).toString('base64url');
    const ts = now();
    const expires = new Date(Date.now() + ttlHours * 3600_000).toISOString();
    db.prepare(
      `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at, user_agent, last_seen_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    ).run(id, userId, ts, expires, userAgent, ts);
    return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session;
  },

  /** Returns the session only if it exists, is unrevoked, and has not expired. */
  findValid(id: string): Session | undefined {
    const row = getDb().prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
    if (!row) return undefined;
    if (row.revoked_at !== null) return undefined;
    if (new Date(row.expires_at).getTime() <= Date.now()) return undefined;
    return row;
  },

  touch(id: string): void {
    getDb().prepare('UPDATE sessions SET last_seen_at = ? WHERE id = ?').run(now(), id);
  },

  /** Revokes one session — not every session the student holds. */
  revoke(id: string): void {
    getDb().prepare('UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now(), id);
  },
};

// ── progress ─────────────────────────────────────────────────────────────────

export interface Progress {
  user_id: number;
  exercise_slug: string;
  lib_rs: string | null;
  main_rs: string | null;
  status: 'in_progress' | 'passed';
  updated_at: string;
}

export const progress = {
  listForUser(userId: number): Progress[] {
    return getDb().prepare('SELECT * FROM progress WHERE user_id = ?').all(userId) as Progress[];
  },

  /** Scoped to the caller. There is no "get anyone's progress" function. */
  get(userId: number, slug: string): Progress | undefined {
    return getDb()
      .prepare('SELECT * FROM progress WHERE user_id = ? AND exercise_slug = ?')
      .get(userId, slug) as Progress | undefined;
  },

  /**
   * Clear the saved code so the exercise serves its starter again.
   *
   * `status` is deliberately left alone: the student did pass it, and the
   * confirmation offers to replace the *code*, not to erase the achievement.
   */
  clearCode(userId: number, slug: string): void {
    getDb()
      .prepare(
        `UPDATE progress SET lib_rs = NULL, main_rs = NULL, updated_at = ?
          WHERE user_id = ? AND exercise_slug = ?`,
      )
      .run(now(), userId, slug);
  },

  /**
   * Explicit field allow-list: only lib_rs, main_rs and status are writable.
   * user_id comes from the session, never the request body, so a client cannot
   * write into someone else's row.
   */
  save(userId: number, slug: string, fields: { libRs?: string | null; mainRs?: string | null; status?: 'in_progress' | 'passed' }): Progress {
    const db = getDb();
    const existing = progress.get(userId, slug);
    const lib = fields.libRs !== undefined ? fields.libRs : (existing?.lib_rs ?? null);
    const main = fields.mainRs !== undefined ? fields.mainRs : (existing?.main_rs ?? null);
    const status = fields.status ?? existing?.status ?? 'in_progress';

    db.prepare(
      `INSERT INTO progress (user_id, exercise_slug, lib_rs, main_rs, status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, exercise_slug) DO UPDATE SET
         lib_rs = excluded.lib_rs, main_rs = excluded.main_rs,
         status = excluded.status, updated_at = excluded.updated_at`,
    ).run(userId, slug, lib, main, status, now());

    return progress.get(userId, slug)!;
  },
};

// ── snapshots ────────────────────────────────────────────────────────────────

export type SnapshotKind = 'manual' | 'passing';

export interface Snapshot {
  id: number;
  user_id: number;
  exercise_slug: string;
  kind: SnapshotKind;
  lib_rs: string | null;
  main_rs: string | null;
  created_at: string;
}

/** How many manual saves to keep before the oldest is dropped. */
const MANUAL_KEEP = 3;

export const snapshots = {
  /**
   * Store a manual save. Several are kept, so pressing Save never destroys the
   * previous one — which is what would otherwise force a confirmation dialog on
   * an action that should feel cheap.
   */
  saveManual(userId: number, slug: string, libRs: string | null, mainRs: string | null): Snapshot {
    const db = getDb();
    const info = db
      .prepare(
        `INSERT INTO snapshots (user_id, exercise_slug, kind, lib_rs, main_rs, created_at)
         VALUES (?, ?, 'manual', ?, ?, ?)`,
      )
      .run(userId, slug, libRs, mainRs, now());

    // Keep the newest few; an unbounded history would grow without ever being
    // asked for.
    db.prepare(
      `DELETE FROM snapshots
        WHERE user_id = ? AND exercise_slug = ? AND kind = 'manual'
          AND id NOT IN (
            SELECT id FROM snapshots
             WHERE user_id = ? AND exercise_slug = ? AND kind = 'manual'
             ORDER BY created_at DESC, id DESC LIMIT ?
          )`,
    ).run(userId, slug, userId, slug, MANUAL_KEEP);

    return db.prepare('SELECT * FROM snapshots WHERE id = ?').get(info.lastInsertRowid) as Snapshot;
  },

  /**
   * Record the code that just passed, replacing any earlier one.
   *
   * The most recent passing version is the useful fallback: a student who
   * passes, refactors, then breaks it wants what worked last, not what worked
   * first.
   */
  savePassing(userId: number, slug: string, libRs: string | null, mainRs: string | null): void {
    const db = getDb();
    db.prepare(
      `DELETE FROM snapshots WHERE user_id = ? AND exercise_slug = ? AND kind = 'passing'`,
    ).run(userId, slug);
    db.prepare(
      `INSERT INTO snapshots (user_id, exercise_slug, kind, lib_rs, main_rs, created_at)
       VALUES (?, ?, 'passing', ?, ?, ?)`,
    ).run(userId, slug, libRs, mainRs, now());
  },

  /** Newest first. Scoped to the caller, like everything else here. */
  list(userId: number, slug: string): Snapshot[] {
    return getDb()
      .prepare(
        `SELECT * FROM snapshots WHERE user_id = ? AND exercise_slug = ?
          ORDER BY created_at DESC, id DESC`,
      )
      .all(userId, slug) as Snapshot[];
  },

  /** Returns undefined for another student's snapshot, so it reads as missing. */
  byId(userId: number, id: number): Snapshot | undefined {
    return getDb()
      .prepare('SELECT * FROM snapshots WHERE id = ? AND user_id = ?')
      .get(id, userId) as Snapshot | undefined;
  },
};

// ── attempts and runner usage ────────────────────────────────────────────────

export const attempts = {
  record(userId: number, slug: string, kind: 'run' | 'test', exitCode: number, durationMs: number): void {
    getDb()
      .prepare(
        `INSERT INTO attempts (user_id, exercise_slug, kind, exit_code, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, slug, kind, exitCode, durationMs, now());
  },
};

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
