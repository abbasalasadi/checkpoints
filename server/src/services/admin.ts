/**
 * V5 admin view (D36-D39): usage and performance totals for admin accounts.
 *
 * Read-only by construction: every query runs on a separate connection opened
 * with `readonly: true`, so nothing here can write, even by mistake. Totals
 * and charts, no student code (D37); names appear only in who is online now
 * (D40) and in the user summaries of submissions and exams (D41).
 */
import Database from 'better-sqlite3';
import { existsSync, readdirSync, statfsSync, statSync } from 'node:fs';
import { cpus, freemem, loadavg, totalmem } from 'node:os';
import { dirname, join } from 'node:path';
import { config } from '../config/index.js';
import { LANGUAGES, type Language } from '../languages.js';
import { listExercises } from './exercises.js';
import { examMark, examMaxMark, requiredWeight, trackProgress } from './marks.js';

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

/** One sample of the process, taken every minute in memory (D44). */
export interface ServerSample {
  at: string;
  rssMb: number;
  heapMb: number;
  cpuPct: number;
  load1: number;
}
export const SAMPLE_MS = 60_000;
const KEEP = 24 * 60;
const samples: ServerSample[] = [];
let lastCpu = process.cpuUsage();
let lastAt = Date.now();

/** Take one sample; exported for tests. Nothing is written to disk. */
export function sampleServer(now = Date.now()): ServerSample {
  const cpu = process.cpuUsage(lastCpu);
  const elapsed = Math.max(1, now - lastAt) * 1000;
  lastCpu = process.cpuUsage();
  lastAt = now;
  const m = process.memoryUsage();
  const s: ServerSample = {
    at: new Date(now).toISOString(),
    rssMb: Math.round(m.rss / 1048576),
    heapMb: Math.round(m.heapUsed / 1048576),
    cpuPct: Math.round(((cpu.user + cpu.system) / elapsed) * 1000) / 10,
    load1: Math.round(loadavg()[0]! * 100) / 100,
  };
  samples.push(s);
  if (samples.length > KEEP) samples.splice(0, samples.length - KEEP);
  return s;
}
setInterval(() => sampleServer(), SAMPLE_MS).unref();

function backups(): { at: string; sizeBytes: number }[] {
  const dir = join(dirname(dirname(config.dbPath)), 'backups');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.gz') || f.endsWith('.db'))
    .map((f) => statSync(join(dir, f)))
    .sort((a, b) => a.mtimeMs - b.mtimeMs)
    .slice(-14)
    .map((st) => ({ at: new Date(st.mtimeMs).toISOString(), sizeBytes: st.size }));
}

function disk(): { freeBytes: number; totalBytes: number } | null {
  try {
    const st = statfsSync(dirname(config.dbPath));
    return { freeBytes: st.bavail * st.bsize, totalBytes: st.blocks * st.bsize };
  } catch {
    return null;
  }
}

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
      startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
      node: process.version,
      cpus: cpus().length,
      hostMemoryMb: { total: Math.round(totalmem() / 1048576), free: Math.round(freemem() / 1048576) },
      disk: disk(),
      backups: backups(),
      history: samples.length ? [...samples] : [sampleServer()],
    },
  };
}

// ── user summaries (D41): submissions and exam results, no code ──────────────

export interface UserRow {
  username: string;
  joinedAt: string;
  lastActiveAt: string | null;
  submits: number;
  submitsPassed: number;
  exercisesPassed: number;
  exams: number;
  languages: Language[];
}

/** Every student, one row each: submissions and exams in summary. */
export function userList(db = readOnlyDb()): UserRow[] {
  return db
    .prepare(
      `SELECT u.identifier_normalized username, u.created_at joinedAt,
              MAX(COALESCE((SELECT MAX(created_at) FROM attempts WHERE user_id = u.id), ''),
                  COALESCE((SELECT MAX(last_seen_at) FROM sessions WHERE user_id = u.id), ''),
                  COALESCE(u.last_login_at, '')) lastActiveAt,
              (SELECT COUNT(*) FROM attempts WHERE user_id = u.id AND kind = 'test') submits,
              (SELECT COUNT(*) FROM attempts WHERE user_id = u.id AND kind = 'test' AND outcome = 'passed') submitsPassed,
              (SELECT COUNT(*) FROM progress WHERE user_id = u.id AND status = 'passed') exercisesPassed,
              (SELECT COUNT(*) FROM exams WHERE user_id = u.id AND status != 'active') exams,
              (SELECT GROUP_CONCAT(DISTINCT language) FROM attempts WHERE user_id = u.id) langs
         FROM users u ORDER BY lastActiveAt DESC`,
    )
    .all()
    .map((r) => {
      const { langs, ...row } = r as UserRow & { langs: string | null };
      return { ...row, lastActiveAt: row.lastActiveAt || null, languages: (langs ?? '').split(',').filter(Boolean) as Language[] };
    });
}

/** One student's summary per language and exam results; undefined if unknown. */
export function userProfile(username: string, db = readOnlyDb()) {
  const u = db.prepare('SELECT id, identifier_normalized username, created_at FROM users WHERE identifier_normalized = ?').get(username.trim().toLowerCase()) as
    | { id: number; username: string; created_at: string }
    | undefined;
  if (!u) return undefined;
  const summary = userList(db).find((r) => r.username === u.username)!;

  const tracks = LANGUAGES.map((language: Language) => {
    const known = listExercises(language).map((e) => e.slug);
    const knownSet = new Set(known);
    const passed = new Set(
      (db.prepare(`SELECT exercise_slug s FROM progress WHERE user_id = ? AND language = ? AND status = 'passed'`).all(u.id, language) as { s: string }[])
        .map((r) => r.s)
        .filter((s) => knownSet.has(s)),
    );
    const c = db
      .prepare(
        `SELECT SUM(kind = 'run') runs, SUM(kind = 'test') submits, SUM(kind = 'test' AND outcome = 'passed') submitsPassed, MAX(created_at) lastAt
           FROM attempts WHERE user_id = ? AND language = ?`,
      )
      .get(u.id, language) as { runs: number | null; submits: number | null; submitsPassed: number | null; lastAt: string | null };
    return {
      language,
      total: known.length,
      passed: passed.size,
      progress: trackProgress(language, known, passed),
      runs: c.runs ?? 0,
      submits: c.submits ?? 0,
      submitsPassed: c.submitsPassed ?? 0,
      lastAt: c.lastAt,
    };
  });

  const exams = (
    db.prepare(`SELECT id, language, checkpoint, minutes, started_at, ended_at, status FROM exams WHERE user_id = ? ORDER BY started_at DESC`).all(u.id) as {
      id: number;
      language: Language;
      checkpoint: string;
      minutes: number;
      started_at: string;
      ended_at: string | null;
      status: string;
    }[]
  ).map((e) => {
    const items = (db.prepare('SELECT exercise_slug slug, passed_at FROM exam_items WHERE exam_id = ? ORDER BY level').all(e.id) as { slug: string; passed_at: string | null }[]).map(
      (i) => ({ slug: i.slug, passed: i.passed_at !== null }),
    );
    const graded = requiredWeight(e.language, e.checkpoint) > 0;
    return {
      language: e.language,
      checkpoint: e.checkpoint,
      minutes: e.minutes,
      startedAt: e.started_at,
      endedAt: e.ended_at,
      status: e.status,
      levels: items.length,
      levelsPassed: items.filter((i) => i.passed).length,
      mark: graded ? examMark(e.language, e.checkpoint, items) : null,
      maxMark: graded ? examMaxMark(e.language, e.checkpoint, items.map((i) => i.slug)) : null,
    };
  });

  return { username: u.username, joinedAt: u.created_at, lastActiveAt: summary.lastActiveAt, tracks, exams };
}
