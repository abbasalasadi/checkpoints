/**
 * V5 admin view (D36-D39): usage and performance totals for admin accounts.
 *
 * Read-only by construction: every query runs on a separate connection opened
 * with `readonly: true`, so nothing here can write, even by mistake. Totals
 * and charts, no student code (D37); the one list of names is who is online
 * now (D40, owner 2026-11-10).
 */
import Database from 'better-sqlite3';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config } from '../config/index.js';
import { LANGUAGES } from '../languages.js';

export type Range = 'today' | '7d' | '30d';
export const RANGES: Range[] = ['today', '7d', '30d'];

let ro: Database.Database | null = null;
let roPath = '';

/** The admin's own read-only connection to the app database. */
export function readOnlyDb(path = config.dbPath): Database.Database {
  if (!ro || roPath !== path) {
    ro?.close();
    ro = new Database(path, { readonly: true, fileMustExist: true });
    ro.pragma('busy_timeout = 5000');
    roPath = path;
  }
  return ro;
}

export function closeReadOnlyDb(): void {
  ro?.close();
  ro = null;
}

export function isAdmin(identifier: string): boolean {
  return config.adminUsernames.includes(identifier.trim().toLowerCase());
}

/** Start of the range, as the ISO text the tables store. */
export function rangeStart(range: Range, now = new Date()): string {
  const d = new Date(now);
  if (range === 'today') d.setUTCHours(0, 0, 0, 0);
  else d.setTime(d.getTime() - (range === '7d' ? 7 : 30) * 86_400_000);
  return d.toISOString();
}

const percentile = (sorted: number[], p: number): number | null =>
  sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]! : null;

/** Online = a valid session the browser used in the last ONLINE_MINUTES. */
export const ONLINE_MINUTES = 5;

/** Outcomes that mean the system failed, not the student's answer. */
const SYSTEM_FAILURES = ['timeout', 'error'];

function lastBackup(): string | null {
  const dir = join(dirname(dirname(config.dbPath)), 'backups');
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.gz') || f.endsWith('.db'));
  let latest = 0;
  for (const f of files) latest = Math.max(latest, statSync(join(dir, f)).mtimeMs);
  return latest ? new Date(latest).toISOString() : null;
}

export function overview(range: Range, db = readOnlyDb(), now = new Date()) {
  const since = rangeStart(range, now);
  const count = (sql: string, ...args: unknown[]) => (db.prepare(sql).get(...args) as { n: number }).n;

  const activeSince = (iso: string) =>
    count(
      `SELECT COUNT(*) n FROM (SELECT user_id FROM attempts WHERE created_at >= ?
         UNION SELECT user_id FROM sessions WHERE last_seen_at >= ?)`,
      iso,
      iso,
    );

  const attemptsRows = db
    .prepare(`SELECT language, kind, outcome, duration_ms d, created_at FROM attempts WHERE created_at >= ?`)
    .all(since) as { language: string; kind: string; outcome: string | null; d: number | null; created_at: string }[];

  // Per day (UTC date) and per hour of day.
  const perDay = new Map<string, { runs: number; submits: number }>();
  const perHour = Array.from({ length: 24 }, () => 0);
  const perLang = new Map<string, { runs: number; submits: number; durations: number[]; system: number; total: number }>();
  for (const l of LANGUAGES) perLang.set(l, { runs: 0, submits: 0, durations: [], system: 0, total: 0 });
  for (const a of attemptsRows) {
    const day = a.created_at.slice(0, 10);
    const dd = perDay.get(day) ?? { runs: 0, submits: 0 };
    const submit = a.kind === 'test';
    if (submit) dd.submits++;
    else dd.runs++;
    perDay.set(day, dd);
    const h = Number(a.created_at.slice(11, 13));
    if (Number.isFinite(h)) perHour[h]!++;
    const l = perLang.get(a.language) ?? { runs: 0, submits: 0, durations: [], system: 0, total: 0 };
    if (submit) l.submits++;
    else l.runs++;
    if (a.outcome !== 'cancelled') {
      l.total++;
      if (a.outcome && SYSTEM_FAILURES.includes(a.outcome)) l.system++;
      else if (a.d !== null) l.durations.push(a.d);
    }
    perLang.set(a.language, l);
  }

  const days: { day: string; runs: number; submits: number }[] = [];
  const first = new Date(since);
  first.setUTCHours(0, 0, 0, 0);
  for (let t = first.getTime(); t <= now.getTime(); t += 86_400_000) {
    const day = new Date(t).toISOString().slice(0, 10);
    days.push({ day, ...(perDay.get(day) ?? { runs: 0, submits: 0 }) });
  }

  const languages = [...perLang.entries()].map(([language, l]) => {
    const sorted = l.durations.sort((x, y) => x - y);
    return {
      language,
      runs: l.runs,
      submits: l.submits,
      medianMs: percentile(sorted, 50),
      p95Ms: percentile(sorted, 95),
      systemFailureRate: l.total ? l.system / l.total : 0,
    };
  });

  const topExercises = db
    .prepare(
      `SELECT language, exercise_slug slug, COUNT(*) attempts, SUM(outcome = 'passed' AND kind = 'test') passes
         FROM attempts WHERE created_at >= ? GROUP BY language, exercise_slug ORDER BY attempts DESC, slug`,
    )
    .all(since) as { language: string; slug: string; attempts: number; passes: number }[];

  const nowIso = now.toISOString();
  const onlineSince = new Date(now.getTime() - ONLINE_MINUTES * 60_000).toISOString();
  const recentSince = new Date(now.getTime() - 30 * 60_000).toISOString();
  const online = db
    .prepare(
      `SELECT u.identifier_normalized username, MAX(s.last_seen_at) lastSeenAt,
              (SELECT a.language FROM attempts a WHERE a.user_id = u.id AND a.created_at >= ? ORDER BY a.created_at DESC LIMIT 1) language,
              (SELECT a.exercise_slug FROM attempts a WHERE a.user_id = u.id AND a.created_at >= ? ORDER BY a.created_at DESC LIMIT 1) slug,
              (SELECT COUNT(*) FROM exams e WHERE e.user_id = u.id AND e.status = 'active') inExam
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.last_seen_at >= ? AND s.revoked_at IS NULL AND s.expires_at > ?
        GROUP BY u.id ORDER BY lastSeenAt DESC`,
    )
    .all(recentSince, recentSince, onlineSince, nowIso) as {
    username: string;
    lastSeenAt: string;
    language: string | null;
    slug: string | null;
    inExam: number;
  }[];

  const examRows = db
    .prepare(`SELECT status, COUNT(*) n FROM exams WHERE started_at >= ? GROUP BY status`)
    .all(since) as { status: string; n: number }[];
  const exams = { started: 0, active: 0, finished: 0, expired: 0, abandoned: 0 };
  for (const r of examRows) {
    exams.started += r.n;
    if (r.status in exams) exams[r.status as keyof typeof exams] += r.n;
  }

  const dbSize = (() => {
    let n = 0;
    for (const f of [config.dbPath, `${config.dbPath}-wal`]) if (existsSync(f)) n += statSync(f).size;
    return n;
  })();

  return {
    range,
    since,
    generatedAt: now.toISOString(),
    usage: {
      students: count('SELECT COUNT(*) n FROM users'),
      activeToday: activeSince(rangeStart('today', now)),
      active7d: activeSince(rangeStart('7d', now)),
      active30d: activeSince(rangeStart('30d', now)),
      newAccounts: count('SELECT COUNT(*) n FROM users WHERE created_at >= ?', since),
      runs: attemptsRows.filter((a) => a.kind !== 'test').length,
      submits: attemptsRows.filter((a) => a.kind === 'test').length,
      days,
      topExercises,
      exams,
    },
    online: online.map((o) => ({ ...o, inExam: o.inExam > 0 })),
    performance: { languages, busiestHours: perHour },
    server: {
      uptimeSeconds: Math.round(process.uptime()),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
      dbSizeBytes: dbSize,
      lastBackupAt: lastBackup(),
    },
  };
}
