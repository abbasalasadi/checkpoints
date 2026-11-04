/**
 * Routing and handlers.
 *
 * Ownership rule applied throughout: the acting user comes from the session,
 * and every read or write is scoped to it. A row belonging to someone else
 * returns 404, never 403, so its existence is not revealed.
 *
 * Exercise routes are prefixed by language (docs/v1-contracts.md):
 *   /api/:lang/exercises, /api/:lang/exercises/:slug/...
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config/index.js';
import { isLanguage, LANGUAGES, SLUG_PATTERN, type Language } from '../languages.js';
import { logger, redactIdentifier } from '../logger.js';
import {
  clearSessionCookie,
  clientIp,
  RateLimiter,
  readJsonBody,
  requireCaller,
  resolveCaller,
  sendError,
  sendJson,
  setSessionCookie,
  type Caller,
} from '../middleware/http.js';
import { attempts, exams, preferences, progress, sessions, snapshots, stars, users } from '../repositories/index.js';
import { normalizePreferences } from '../services/preferences.js';
import { assertUsername, InvalidCredentialsError, InvalidIdentifierError, signIn, UpstreamError } from '../services/auth.js';
import {
  getExercise,
  hintFor,
  listExercises,
  filesForRunner,
  pickEditorFiles,
  placementsFor,
  publicView,
  runnerExerciseMeta,
  workingFiles,
  type Exercise,
} from '../services/exercises.js';
import * as runs from '../services/runs.js';
import { pickExamItems } from '../services/exams.js';
import { examMark, examMaxMark, placementView, trackProgress, valueOf } from '../services/marks.js';
import type { Exam } from '../repositories/index.js';

const loginLimiter = new RateLimiter(10, 5 * 60_000);
const formatLimiter = new RateLimiter(60, 60_000);

const MAX_ARGS = 32;
const MAX_ARG_LEN = 4096;

type Params = { lang: Language; slug: string };

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // Unauthenticated liveness probe — the deploy health check polls it.
  if (path === '/healthz' && method === 'GET') {
    sendJson(res, 200, { status: 'ok', app: config.appName });
    return;
  }

  // ── auth (/api/auth/*; the Rust reference's /api/login etc. kept as aliases)
  if ((path === '/api/auth/login' || path === '/api/login') && method === 'POST') return login(req, res);
  if ((path === '/api/auth/logout' || path === '/api/logout') && method === 'POST') return logout(req, res);
  if ((path === '/api/auth/me' || path === '/api/me') && method === 'GET') return me(req, res);
  if (path === '/api/auth/dev-login' && method === 'POST') return devLogin(req, res);
  // Unauthenticated: the sign-in screen asks before anyone is signed in.
  if (path === '/api/auth/config' && method === 'GET') {
    sendJson(res, 200, { devLogin: config.devLoginEnabled });
    return;
  }

  // ── mock exams (V3)
  if (path === '/api/exams' && method === 'GET') return listExams(req, res);
  if (path === '/api/exams' && method === 'POST') return startExam(req, res);
  const examMatch = /^\/api\/exams\/(\d{1,12})(?:\/(end))?$/.exec(path);
  if (examMatch?.[1] && !examMatch[2] && method === 'GET') return getExam(req, res, Number(examMatch[1]));
  if (examMatch?.[1] && examMatch[2] && method === 'POST') return endExam(req, res, Number(examMatch[1]));

  // D28: while an exam is open, only its own exercises and the basics answer.
  const examCaller = resolveCaller(req);
  const exam = examCaller ? exams.active(examCaller.user.id) : undefined;
  if (exam && !examAllows(exam, path, method)) {
    sendError(res, 403, 'exam_active', 'Not available during a mock exam.');
    return;
  }

  if (path === '/api/languages' && method === 'GET') return languages(req, res);
  if (path === '/api/preferences' && method === 'GET') return getPreferences(req, res);
  if (path === '/api/dashboard' && method === 'GET') return dashboard(req, res);
  if (path === '/api/history' && method === 'GET') return history(req, res, url.searchParams);
  if (path === '/api/vault' && method === 'GET') return vault(req, res);
  if (path === '/api/history/exercises' && method === 'GET') return historyByExercise(req, res, url.searchParams);
  const tl = /^\/api\/history\/exercises\/([a-z]+)\/([^/]+)$/.exec(path);
  if (tl?.[1] && tl[2] && method === 'GET') return exerciseTimeline(req, res, tl[1], tl[2]);
  const historyMatch = /^\/api\/history\/(\d{1,12})$/.exec(path);
  if (historyMatch?.[1] && method === 'GET') return historyDetail(req, res, Number(historyMatch[1]));
  if (path === '/api/preferences' && method === 'PUT') return putPreferences(req, res);

  // ── runs, not language-scoped (the id is enough)
  if (path === '/api/runner' && method === 'GET') return runnerState(req, res);
  const cancelMatch = /^\/api\/runs\/([A-Za-z0-9_-]{1,64})\/cancel$/.exec(path);
  if (cancelMatch?.[1] && method === 'POST') return cancelRun(req, res, cancelMatch[1]);

  // ── language-scoped
  const langMatch = /^\/api\/([a-z]+)(\/.*)$/.exec(path);
  if (langMatch?.[1] && langMatch[2] && isLanguage(langMatch[1])) {
    const lang = langMatch[1];
    const rest = langMatch[2];

    if (rest === '/exercises' && method === 'GET') return listAll(req, res, lang);
    if (rest === '/progress' && method === 'GET') return listProgress(req, res, lang);

    const m = /^\/(exercises|progress|snapshots)\/([^/]+)(?:\/([a-z]+))?(?:\/([a-z]+))?$/.exec(rest);
    if (m?.[1] && m[2] && SLUG_PATTERN.test(m[2])) {
      const p: Params = { lang, slug: m[2] };
      const [, group, , action, sub] = m;

      if (group === 'exercises') {
        if (!action && method === 'GET') return exam ? examGetOne(req, res, p, exam) : getOne(req, res, p);
        if (action === 'code' && !sub && method === 'PUT') return exam ? examSave(req, res, p, exam) : saveCode(req, res, p);
        if (action === 'reset' && !sub && method === 'POST') return exam ? examReset(req, res, p, exam) : resetCode(req, res, p);
        if (action === 'format' && !sub && method === 'POST') return formatCode(req, res, p);
        if ((action === 'run' || action === 'test' || action === 'submit') && !sub && method === 'POST') {
          return execute(req, res, p, action === 'run' ? 'run' : 'test', exam);
        }
        if (action === 'attempts' && !sub && method === 'GET') return listAttempts(req, res, p);
        if (action === 'report' && !sub && method === 'GET') return report(req, res, p);
        if (action === 'hint' && !sub && method === 'GET') return hint(req, res, p);
        if (action === 'star' && !sub && (method === 'PUT' || method === 'DELETE')) return star(req, res, p, method === 'PUT');
        if (action === 'snapshots' && !sub && method === 'GET') return listSnapshots(req, res, p);
        if (action === 'snapshots' && !sub && method === 'POST') return createSnapshot(req, res, p);
        if (action === 'snapshots' && sub === 'restore' && method === 'POST') return restoreSnapshot(req, res, p);
      }
      // Rust reference shapes, language-prefixed.
      if (group === 'progress' && !action && method === 'PUT') return exam ? examSave(req, res, p, exam) : saveCode(req, res, p);
      if (group === 'progress' && !action && method === 'DELETE') return exam ? examReset(req, res, p, exam) : resetCode(req, res, p);
      if (group === 'snapshots' && !action && method === 'GET') return listSnapshots(req, res, p);
      if (group === 'snapshots' && !action && method === 'POST') return createSnapshot(req, res, p);
      if (group === 'snapshots' && action === 'restore' && !sub && method === 'POST') return restoreSnapshot(req, res, p);
    }
  }

  sendError(res, 404, 'not_found', 'Not found.');
}

async function body<T>(req: IncomingMessage, res: ServerResponse): Promise<T | null> {
  try {
    return await readJsonBody<T>(req, 2 * 1024 * 1024);
  } catch (err) {
    const large = String(err).includes('large');
    sendError(res, large ? 413 : 400, large ? 'payload_too_large' : 'invalid_request', large ? 'Payload too large.' : 'Invalid request.');
    return null;
  }
}

function exerciseFor(res: ServerResponse, p: Params): Exercise | null {
  const ex = getExercise(p.lang, p.slug);
  if (!ex) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return null;
  }
  return ex;
}

// ── auth ─────────────────────────────────────────────────────────────────────

function startSession(req: IncomingMessage, res: ServerResponse, userId: number): void {
  const { token } = sessions.create(userId, config.sessionTtlHours, req.headers['user-agent'] ?? null);
  setSessionCookie(res, token, config.sessionTtlHours);
}

async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = clientIp(req, config.appEnv === 'production');
  const limit = loginLimiter.check(ip);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    sendError(res, 429, 'rate_limited', 'Too many attempts. Try again shortly.');
    return;
  }

  const b = await body<{ identifier?: unknown; password?: unknown }>(req, res);
  if (!b) return;
  const identifier = typeof b.identifier === 'string' ? b.identifier.trim() : '';
  const password = typeof b.password === 'string' ? b.password : '';
  if (identifier === '' || password === '') {
    sendError(res, 400, 'invalid_request', 'Identifier and password are required.');
    return;
  }

  try {
    const result = await signIn(identifier, password);
    const user = users.upsertOnLogin(identifier, result.rebootUserId, result.claims);
    startSession(req, res, user.id);
    logger.info('login.ok', { userId: user.id, identifier: redactIdentifier(identifier) });
    // The upstream token is deliberately not returned or stored.
    sendJson(res, 200, { identifier: user.identifier_normalized });
  } catch (err) {
    if (err instanceof InvalidIdentifierError) {
      sendError(res, 400, 'invalid_identifier', err.message);
      return;
    }
    if (err instanceof InvalidCredentialsError) {
      sendError(res, 401, 'invalid_credentials', 'Invalid credentials.');
      return;
    }
    if (err instanceof UpstreamError) {
      sendError(res, 502, 'upstream_failed', 'Could not reach the sign-in service. Try again shortly.');
      return;
    }
    logger.error('login.unexpected', { error: String(err) });
    sendError(res, 500, 'internal_error', 'Something went wrong.');
  }
}

/**
 * D14: sign in as any username without reboot01, for local development and
 * tests only. In production the route does not exist (404, not 403).
 */
async function devLogin(req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (!config.devLoginEnabled) {
    sendError(res, 404, 'not_found', 'Not found.');
    return;
  }
  const b = await body<{ username?: unknown }>(req, res);
  if (!b) return;
  const username = typeof b.username === 'string' ? b.username.trim() : '';
  try {
    assertUsername(username);
  } catch (err) {
    sendError(res, 400, 'invalid_identifier', (err as Error).message);
    return;
  }
  const user = users.upsertOnLogin(username, null, null);
  startSession(req, res, user.id);
  logger.warn('login.dev', { userId: user.id, identifier: redactIdentifier(username), env: config.appEnv });
  sendJson(res, 200, { identifier: user.identifier_normalized, dev: true });
}

function logout(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  // Revokes THIS session only — a student signed in elsewhere stays signed in.
  sessions.revoke(caller.sessionHash);
  clearSessionCookie(res);
  logger.info('logout.ok', { userId: caller.user.id });
  sendJson(res, 200, { ok: true });
}

function me(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  sendJson(res, 200, { identifier: caller.user.identifier_normalized, devLogin: config.devLoginEnabled });
}

// ── preferences (V2, D24) ────────────────────────────────────────────────────

function getPreferences(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  sendJson(res, 200, { preferences: normalizePreferences(preferences.get(caller.user.id)) });
}

/** Partial update: only the keys sent change; invalid values are ignored. */
async function putPreferences(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const input = await body<unknown>(req, res);
  if (input === null) {
    if (!res.headersSent) sendError(res, 400, 'invalid_request', 'Invalid request.');
    return;
  }
  const next = normalizePreferences(input, normalizePreferences(preferences.get(caller.user.id)));
  preferences.set(caller.user.id, next);
  sendJson(res, 200, { preferences: next });
}

// ── dashboard and history (V2 features 1 and 2) ─────────────────────────────

function titleOf(lang: Language, slug: string): string {
  return getExercise(lang, slug)?.title ?? slug;
}

function attemptView(a: { id: number; language: Language; exercise_slug: string; kind: string; outcome: string | null; duration_ms: number | null; created_at: string }) {
  return {
    id: a.id,
    language: a.language,
    slug: a.exercise_slug,
    title: titleOf(a.language, a.exercise_slug),
    kind: a.kind,
    outcome: a.outcome,
    durationMs: a.duration_ms,
    at: a.created_at,
  };
}

/**
 * Per track: totals, the exercise to resume, and per-checkpoint (gate) counts.
 * Plus recent activity across tracks and attempt statistics.
 */
function dashboard(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const uid = caller.user.id;
  const counts = attempts.counts(uid);
  const finished = exams.list(uid).filter((e) => e.status !== 'active');
  const tracks = LANGUAGES.map((lang) => {
    const all = listExercises(lang);
    const rows = progress.listForUser(uid, lang);
    const passed = new Set(rows.filter((p) => p.status === 'passed').map((p) => p.exercise_slug));
    const known = new Set(all.map((e) => e.slug));
    const latest = rows
      .filter((p) => known.has(p.exercise_slug))
      .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1))[0];
    const gates = new Map<string, { checkpoint: string; total: number; passed: number }>();
    for (const pl of placementsFor(lang)) {
      const g = gates.get(pl.checkpoint) ?? { checkpoint: pl.checkpoint, total: 0, passed: 0 };
      g.total += 1;
      if (passed.has(pl.exercise)) g.passed += 1;
      gates.set(pl.checkpoint, g);
    }
    const mine = counts.filter((c) => c.language === lang);
    const sum = (f: (c: (typeof mine)[number]) => boolean) => mine.filter(f).reduce((n, c) => n + c.n, 0);
    return {
      language: lang,
      total: all.length,
      passed: [...passed].filter((s) => known.has(s)).length,
      // Percent, weighted (D35).
      progress: trackProgress(lang, [...known], passed),
      bestExamMark: finished
        .filter((e) => e.language === lang)
        .map((e) => examMark(lang, e.checkpoint, exams.items(e.id).map((i) => ({ slug: i.exercise_slug, passed: i.passed_at !== null }))))
        .reduce<number | null>((m, v) => (m === null || v > m ? v : m), null),
      started: rows.filter((p) => known.has(p.exercise_slug)).length,
      resume: latest ? { slug: latest.exercise_slug, title: titleOf(lang, latest.exercise_slug), at: latest.updated_at, passed: latest.status === 'passed' } : null,
      gates: [...gates.values()],
      runs: sum((c) => c.kind === 'run'),
      submits: sum((c) => c.kind === 'test'),
      submitsPassed: sum((c) => c.kind === 'test' && c.outcome === 'passed'),
    };
  });
  sendJson(res, 200, { tracks, recent: attempts.recent(uid, 10).map(attemptView) });
}

const HISTORY_PAGE_MAX = 100;

function history(req: IncomingMessage, res: ServerResponse, q: URLSearchParams): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const lang = q.get('language');
  const slug = q.get('slug');
  const kind = q.get('kind');
  const outcome = q.get('outcome');
  const before = Number(q.get('before') ?? 0);
  const limit = Math.min(Math.max(Number(q.get('limit') ?? 50) || 50, 1), HISTORY_PAGE_MAX);
  if ((lang && !isLanguage(lang)) || (slug && !SLUG_PATTERN.test(slug)) || (kind && kind !== 'run' && kind !== 'test') || (outcome && !/^[a-z_]{1,32}$/.test(outcome))) {
    sendError(res, 400, 'invalid_request', 'Invalid filter.');
    return;
  }
  const rows = attempts.search(caller.user.id, {
    language: (lang as Language) || undefined,
    slug: slug || undefined,
    kind: (kind as 'run' | 'test') || undefined,
    outcome: outcome || undefined,
    before: Number.isInteger(before) && before > 0 ? before : undefined,
    limit: limit + 1,
  });
  const more = rows.length > limit;
  const page = rows.slice(0, limit);
  sendJson(res, 200, { attempts: page.map(attemptView), next: more ? page[page.length - 1]!.id : null });
}

/** Gaps longer than this are breaks, not work, in "time spent". */
const ACTIVE_GAP_MS = 15 * 60_000;

/**
 * D26: history by exercise — one summary per exercise the student has tried,
 * newest activity first. Every attempt is still stored; this only groups them.
 */
function historyByExercise(req: IncomingMessage, res: ServerResponse, q: URLSearchParams): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const lang = q.get('language');
  if (lang && !isLanguage(lang)) {
    sendError(res, 400, 'invalid_request', 'Invalid filter.');
    return;
  }
  const uid = caller.user.id;
  type Sum = {
    language: Language; slug: string; title: string; passed: boolean; runs: number; submits: number;
    passedOnSubmit: number | null; firstAt: string; lastAt: string; activeMs: number; lastKind: string; lastOutcome: string | null;
  };
  const by = new Map<string, Sum & { prevMs: number }>();
  for (const a of attempts.allLight(uid, (lang as Language) || undefined)) {
    const key = `${a.language}/${a.exercise_slug}`;
    const ms = Date.parse(a.created_at);
    let s = by.get(key);
    if (!s) {
      s = {
        language: a.language, slug: a.exercise_slug, title: titleOf(a.language, a.exercise_slug), passed: false, runs: 0, submits: 0,
        passedOnSubmit: null, firstAt: a.created_at, lastAt: a.created_at, activeMs: 0, lastKind: a.kind, lastOutcome: a.outcome, prevMs: ms,
      };
      by.set(key, s);
    }
    const gap = ms - s.prevMs;
    if (gap > 0 && gap <= ACTIVE_GAP_MS) s.activeMs += gap;
    s.activeMs += a.duration_ms ?? 0;
    s.prevMs = ms;
    if (a.kind === 'test') {
      s.submits += 1;
      if (a.outcome === 'passed' && s.passedOnSubmit === null) s.passedOnSubmit = s.submits;
    } else s.runs += 1;
    s.lastAt = a.created_at;
    s.lastKind = a.kind;
    s.lastOutcome = a.outcome;
  }
  const passedSlugs = new Map<Language, Set<string>>();
  for (const l of LANGUAGES) passedSlugs.set(l, new Set(progress.listForUser(uid, l).filter((p) => p.status === 'passed').map((p) => p.exercise_slug)));
  const list = [...by.values()]
    .map(({ prevMs: _p, ...s }) => ({ ...s, passed: s.passedOnSubmit !== null || !!passedSlugs.get(s.language)?.has(s.slug) }))
    .sort((a, b) => (a.lastAt < b.lastAt ? 1 : -1));
  sendJson(res, 200, { exercises: list });
}

/** Every attempt on one exercise, oldest first; the browser folds runs between submits. */
function exerciseTimeline(req: IncomingMessage, res: ServerResponse, lang: string, slug: string): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!isLanguage(lang) || !SLUG_PATTERN.test(slug)) {
    sendError(res, 404, 'not_found', 'Not found.');
    return;
  }
  sendJson(res, 200, { attempts: attempts.allLight(caller.user.id, lang, slug, 5000).map(attemptView) });
}

function historyDetail(req: IncomingMessage, res: ServerResponse, id: number): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const a = attempts.detail(caller.user.id, id);
  if (!a) {
    sendError(res, 404, 'not_found', 'Not found.');
    return;
  }
  let files: Record<string, string> = {};
  try {
    files = a.files_json ? (JSON.parse(a.files_json) as Record<string, string>) : {};
  } catch {
    files = {};
  }
  sendJson(res, 200, { ...attemptView(a), exitCode: a.exit_code, files, output: a.output ?? '' });
}

/** The solutions vault: every exercise with a passing copy, across tracks. */
function vault(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const items = snapshots
    .passingAll(caller.user.id)
    .filter((s) => getExercise(s.language, s.exercise_slug))
    .map((s) => ({ language: s.language, slug: s.exercise_slug, title: titleOf(s.language, s.exercise_slug), passedAt: s.created_at, files: s.files }));
  sendJson(res, 200, { items });
}

const FENCE_LANG: Record<Language, string> = { go: 'go', js: 'javascript', rust: 'rust', java: 'java' };

/** A fence longer than any backtick run inside the code, so the block cannot end early. */
function fenced(code: string, lang: string): string {
  const longest = Math.max(2, ...(code.match(/`+/g) ?? []).map((m) => m.length));
  const fence = '`'.repeat(longest + 1);
  return `${fence}${lang}\n${code.replace(/\n$/, '')}\n${fence}`;
}

/**
 * D22: one exercise as a Markdown report — subject, provided file(s), the
 * student's solution (passing copy if any, else the current draft) and result.
 */
export function buildReport(ex: Exercise, solution: Record<string, string>, source: 'passing' | 'draft', result: { outcome: string | null; at: string } | null, who: string): string {
  const lang = FENCE_LANG[ex.language];
  const provided = ex.editorFiles.filter((f) => !ex.expectedFiles.includes(f) && ex.starter[f]);
  const out: string[] = [
    `# ${ex.title} (${ex.language === 'js' ? 'JavaScript' : ex.language === 'go' ? 'Go' : 'Rust'})`,
    '',
    `- Student: ${who}`,
    `- Exported: ${new Date().toISOString()}`,
    `- Solution: ${source === 'passing' ? 'last passing copy' : 'current draft (not yet passed)'}`,
    `- Result: ${result ? `${result.outcome ?? 'unknown'} (${result.at})` : 'not submitted'}`,
    '',
    '## Subject',
    '',
    ex.readme.trim().replace(/^(#+)/gm, '#$1'),
    '',
  ];
  if (provided.length) {
    out.push('## Provided files', '');
    for (const f of provided) out.push(`### ${f}`, '', fenced(ex.starter[f] ?? '', lang), '');
  }
  out.push('## Solution', '');
  for (const f of ex.expectedFiles) out.push(`### ${f}`, '', fenced(solution[f] ?? '', lang), '');
  return out.join('\n');
}

function star(req: IncomingMessage, res: ServerResponse, p: Params, on: boolean): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!exerciseFor(res, p)) return;
  stars.set(caller.user.id, p.lang, p.slug, on);
  sendJson(res, 200, { starred: on });
}

/** The exercise's one-line hint (D4). Closed during an exam (D28). */
function hint(req: IncomingMessage, res: ServerResponse, p: Params): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!exerciseFor(res, p)) return;
  sendJson(res, 200, { hint: hintFor(p.lang, p.slug) });
}

function report(req: IncomingMessage, res: ServerResponse, p: Params): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = getExercise(p.lang, p.slug);
  if (!ex) {
    sendError(res, 404, 'not_found', 'Not found.');
    return;
  }
  const pass = snapshots.passing(caller.user.id, p.lang, p.slug);
  const draft = progress.get(caller.user.id, p.lang, p.slug);
  const solution = pass?.files ?? workingFiles(ex, draft?.files);
  const last = (attempts.listForExercise(caller.user.id, p.lang, p.slug, 50) as { kind: string; outcome: string | null; created_at: string }[]).find(
    (a) => a.kind === 'test',
  );
  const md = buildReport(ex, solution, pass ? 'passing' : 'draft', last ? { outcome: last.outcome, at: last.created_at } : null, caller.user.identifier_normalized);
  res.writeHead(200, {
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="${p.lang}-${p.slug}.md"`,
    'Cache-Control': 'no-store',
  });
  res.end(md);
}

// ── content ──────────────────────────────────────────────────────────────────

function languages(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  sendJson(res, 200, {
    languages: LANGUAGES.map((language) => ({ language, exercises: listExercises(language).length })),
  });
}

function listAll(req: IncomingMessage, res: ServerResponse, lang: Language): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const status = new Map(progress.listForUser(caller.user.id, lang).map((p) => [p.exercise_slug, p.status]));
  const starred = new Set(stars.list(caller.user.id, lang));
  sendJson(res, 200, {
    language: lang,
    exercises: listExercises(lang).map((e) => ({
      ...e,
      passed: status.get(e.slug) === 'passed',
      status: status.get(e.slug) ?? 'not_started',
      starred: starred.has(e.slug),
    })),
    placements: placementsFor(lang).map((pl) => placementView(lang, pl.exercise, pl)),
  });
}

function getOne(req: IncomingMessage, res: ServerResponse, p: Params): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  const saved = progress.get(caller.user.id, p.lang, p.slug);
  sendJson(res, 200, {
    ...publicView(ex),
    placements: ex.placements.map((pl) => placementView(ex.language, ex.slug, pl)),
    // The test is deliberately NOT sent: the runner writes it server-side.
    files: workingFiles(ex, saved?.files),
    starter: ex.starter,
    status: saved?.status ?? 'in_progress',
  });
}

// ── progress ─────────────────────────────────────────────────────────────────

function listProgress(req: IncomingMessage, res: ServerResponse, lang: Language): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  sendJson(res, 200, {
    progress: progress.listForUser(caller.user.id, lang).map((p) => ({
      slug: p.exercise_slug,
      status: p.status,
      updatedAt: p.updated_at,
    })),
  });
}

/**
 * Read `files` from a body. Accepts the Rust reference's {libRs, mainRs} for
 * Rust exercises too, mapped onto src/lib.rs and src/main.rs.
 */
function filesFrom(ex: Exercise, b: { files?: unknown; libRs?: unknown; mainRs?: unknown }): Record<string, string> | null {
  if (b.files !== undefined) return pickEditorFiles(ex, b.files);
  if (ex.language === 'rust' && (typeof b.libRs === 'string' || typeof b.mainRs === 'string')) {
    const raw: Record<string, unknown> = {};
    if (typeof b.libRs === 'string') raw[ex.kind === 'lib' ? 'src/lib.rs' : 'src/main.rs'] = b.libRs;
    if (typeof b.mainRs === 'string') raw['src/main.rs'] = b.mainRs;
    return pickEditorFiles(ex, raw);
  }
  return null;
}

async function saveCode(req: IncomingMessage, res: ServerResponse, p: Params): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  const b = await body<{ files?: unknown; libRs?: unknown; mainRs?: unknown }>(req, res);
  if (!b) return;
  const files = filesFrom(ex, b);
  if (!files) {
    sendError(res, 400, 'invalid_files', `Only ${ex.editorFiles.join(' and ')} can be saved.`);
    return;
  }
  const saved = progress.save(caller.user.id, p.lang, p.slug, { files });
  sendJson(res, 200, { slug: saved.exercise_slug, updatedAt: saved.updated_at });
}

/** Discard the saved code; status is kept. Returns the starter files. */
function resetCode(req: IncomingMessage, res: ServerResponse, p: Params): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  progress.clearCode(caller.user.id, p.lang, p.slug);
  logger.info('progress.reset', { userId: caller.user.id, language: p.lang, slug: p.slug });
  sendJson(res, 200, { slug: p.slug, files: ex.starter });
}

async function formatCode(req: IncomingMessage, res: ServerResponse, p: Params): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!formatLimiter.check(String(caller.user.id)).allowed) {
    sendError(res, 429, 'too_many_requests', 'Slow down a moment.');
    return;
  }
  const ex = exerciseFor(res, p);
  if (!ex) return;
  if (p.lang !== 'go') {
    sendError(res, 404, 'not_supported', 'Format is available for Go exercises only.');
    return;
  }
  const b = await body<{ files?: unknown }>(req, res);
  if (!b) return;
  const files = pickEditorFiles(ex, b.files);
  if (!files) {
    sendError(res, 400, 'invalid_files', `Only ${ex.editorFiles.join(' and ')} can be formatted.`);
    return;
  }
  try {
    const result = (await runs.format(caller.user.id, p.lang, files)) as
      | { ok?: boolean; files?: Record<string, string>; changed?: string[]; error?: string }
      | undefined;
    if (!result || result.ok === false || result.error || !result.files) {
      sendError(res, 400, 'unparseable', result?.error ?? 'The file could not be parsed.');
      return;
    }
    const formatted = result.files;
    const changed = result.changed ?? Object.keys(formatted).filter((n) => formatted[n] !== files[n]);
    sendJson(res, 200, { files: formatted, changed });
  } catch (err) {
    if (runError(res, err, 'run')) return;
    logger.error('format.failed', { userId: caller.user.id, slug: p.slug, error: String(err) });
    sendError(res, 503, 'runner_unavailable', 'The formatter is unavailable. Try again shortly.');
  }
}

// ── snapshots ────────────────────────────────────────────────────────────────

function listSnapshots(req: IncomingMessage, res: ServerResponse, p: Params): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!exerciseFor(res, p)) return;
  sendJson(res, 200, {
    snapshots: snapshots.list(caller.user.id, p.lang, p.slug).map((s) => ({
      id: s.id,
      kind: s.kind,
      createdAt: s.created_at,
    })),
  });
}

/**
 * Save a copy. With `files` in the body, those are saved as the working copy
 * first (Go behaviour); without, the current working copy is snapshotted.
 */
async function createSnapshot(req: IncomingMessage, res: ServerResponse, p: Params): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  const b = (await body<{ files?: unknown; libRs?: unknown; mainRs?: unknown }>(req, res)) ;
  if (!b) return;
  const posted = filesFrom(ex, b);
  if (b.files !== undefined && !posted) {
    sendError(res, 400, 'invalid_files', 'Nothing to save.');
    return;
  }
  if (posted) progress.save(caller.user.id, p.lang, p.slug, { files: posted });
  const working = progress.get(caller.user.id, p.lang, p.slug);
  if (!working?.files) {
    sendError(res, 400, 'nothing_to_save', 'There is nothing to save yet.');
    return;
  }
  const snap = snapshots.saveManual(caller.user.id, p.lang, p.slug, working.files);
  logger.info('snapshot.created', { userId: caller.user.id, language: p.lang, slug: p.slug, id: snap.id });
  sendJson(res, 200, { id: snap.id, kind: snap.kind, createdAt: snap.created_at });
}

/** Copy a snapshot back over the working code, so Run executes what is shown. */
async function restoreSnapshot(req: IncomingMessage, res: ServerResponse, p: Params): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  const b = await body<{ id?: unknown }>(req, res);
  if (!b) return;
  if (typeof b.id !== 'number') {
    sendError(res, 400, 'invalid_request', 'A snapshot id is required.');
    return;
  }
  const snap = snapshots.byId(caller.user.id, b.id);
  if (!snap || snap.language !== p.lang || snap.exercise_slug !== p.slug) {
    sendError(res, 404, 'not_found', 'Snapshot not found.');
    return;
  }
  progress.save(caller.user.id, p.lang, p.slug, { files: snap.files });
  logger.info('snapshot.restored', { userId: caller.user.id, language: p.lang, slug: p.slug, id: snap.id });
  sendJson(res, 200, { kind: snap.kind, files: workingFiles(ex, snap.files) });
}

// ── run / test ───────────────────────────────────────────────────────────────

const cooldownFor = (mode: runs.RunMode) =>
  mode === 'test' ? config.runner.cooldownTestSeconds : config.runner.cooldownRunSeconds;

/** Map the dispatcher's typed errors to responses. Returns true when handled. */
function runError(res: ServerResponse, err: unknown, mode: runs.RunMode): boolean {
  const e = err as { name?: string; secondsRemaining?: number; depth?: number };
  if (e?.name === 'CooldownError') {
    const s = e.secondsRemaining ?? cooldownFor(mode);
    res.setHeader('Retry-After', String(s));
    sendJson(res, 429, {
      error: { code: 'cooling_down', message: `Ready in ${s}s.` },
      secondsRemaining: s,
    });
    return true;
  }
  if (e?.name === 'QueueFullError') {
    sendError(res, 503, 'queue_full', 'Too many runs in flight. Try again in a moment.');
    return true;
  }
  if (e?.name === 'BusyError') {
    sendError(res, 409, 'run_in_progress', 'A run is already in progress.');
    return true;
  }
  return false;
}

async function execute(req: IncomingMessage, res: ServerResponse, p: Params, mode: runs.RunMode, exam?: Exam): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;

  const b = await body<{ files?: unknown; libRs?: unknown; mainRs?: unknown; args?: unknown }>(req, res);
  if (!b) return;

  // A run executes the saved code, so a posted edit lands first.
  if (b.files !== undefined || b.libRs !== undefined || b.mainRs !== undefined) {
    const posted = filesFrom(ex, b);
    if (!posted) {
      sendError(res, 400, 'invalid_files', `Only ${ex.editorFiles.join(' and ')} can be run.`);
      return;
    }
    if (exam) exams.saveFiles(exam.id, p.slug, posted);
    else progress.save(caller.user.id, p.lang, p.slug, { files: posted });
  }

  let args: string[] = [];
  if (mode === 'run' && Array.isArray(b.args) && b.args.length > 0) {
    if (!ex.argv) {
      sendError(res, 400, 'no_arguments', 'This exercise does not read command-line arguments.');
      return;
    }
    if (b.args.length > MAX_ARGS) {
      sendError(res, 400, 'too_many_arguments', `At most ${MAX_ARGS} arguments.`);
      return;
    }
    args = b.args.map(String);
    if (args.some((a) => a.length > MAX_ARG_LEN)) {
      sendError(res, 400, 'argument_too_long', 'An argument is too long.');
      return;
    }
  }

  const files = exam ? examFiles(ex, exam) : workingFiles(ex, progress.get(caller.user.id, p.lang, p.slug)?.files);

  let runId: string;
  try {
    runId = await runs.submit({
      user: caller.user.id,
      language: p.lang,
      slug: p.slug,
      files: filesForRunner(ex, files, mode),
      args,
      mode,
      exercise: runnerExerciseMeta(ex),
    });
  } catch (err) {
    if (runError(res, err, mode)) return;
    logger.error('run.submit_failed', { userId: caller.user.id, language: p.lang, slug: p.slug, error: String(err) });
    sendError(res, 503, 'runner_unavailable', 'Something went wrong on our side, not in your code. Please try again in a moment.');
    return;
  }

  const run = await runs.getRun(runId);
  if (run) recordOnDone(caller, p, mode, run, files, exam?.id);

  sendJson(res, 200, {
    runId,
    state: run?.state ?? 'queued',
    queuePosition: run?.queuePosition ?? 0,
    // The client disables THIS button for this long; run and test have separate clocks.
    cooldownSeconds: cooldownFor(mode),
    argsTruncated: false,
    maxArgs: MAX_ARGS,
  });
}

function recordOnDone(caller: Caller, p: Params, mode: runs.RunMode, run: runs.RunLike, files: Record<string, string>, examId?: number): void {
  const finish = (d: { outcome?: unknown; exitCode?: unknown; durationMs?: unknown }) => {
    try {
      const outcome = typeof d.outcome === 'string' ? d.outcome : null;
      attempts.record({
        userId: caller.user.id,
        language: p.lang,
        slug: p.slug,
        runId: run.id,
        kind: mode,
        outcome,
        exitCode: typeof d.exitCode === 'number' ? d.exitCode : null,
        durationMs: typeof d.durationMs === 'number' ? d.durationMs : null,
        files,
        output: run.output ?? null,
        examId: examId ?? null,
      });
      // An exam submit counts for the exam only, never for practice (D27).
      if (examId !== undefined) {
        if (mode === 'test') exams.recordSubmit(examId, p.slug, outcome === 'passed');
        return;
      }
      // Pass/fail is the dispatcher's verdict, never parsed output.
      if (mode === 'test' && outcome === 'passed') {
        progress.save(caller.user.id, p.lang, p.slug, { status: 'passed' });
        snapshots.savePassing(caller.user.id, p.lang, p.slug, files);
      }
    } catch (err) {
      logger.error('run.record_failed', { runId: run.id, error: String(err) });
    }
  };

  if (run.state === 'done') {
    finish(run);
    return;
  }
  const onEvent = (evt: runs.RunEventLike) => {
    if (evt.type !== 'done') return;
    run.events.off('event', onEvent);
    finish(evt as { outcome?: unknown; exitCode?: unknown; durationMs?: unknown });
  };
  run.events.on('event', onEvent);
}

function listAttempts(req: IncomingMessage, res: ServerResponse, p: Params): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!exerciseFor(res, p)) return;
  sendJson(res, 200, { attempts: attempts.listForExercise(caller.user.id, p.lang, p.slug) });
}

async function cancelRun(req: IncomingMessage, res: ServerResponse, id: string): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const run = await runs.getRun(id);
  // Someone else's run is "nothing to cancel", same as a finished one.
  if (!run || String(run.user) !== String(caller.user.id)) {
    sendJson(res, 200, { cancelled: false });
    return;
  }
  sendJson(res, 200, { cancelled: await runs.cancel(id, String(caller.user.id)) });
}

async function runnerState(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const user = String(caller.user.id);
  const live = await runs.limits();
  sendJson(res, 200, {
    maxConcurrent: config.runner.maxConcurrent,
    cooldownRunSeconds: config.runner.cooldownRunSeconds,
    cooldownTestSeconds: config.runner.cooldownTestSeconds,
    timeoutSeconds: config.runner.timeoutSeconds,
    warnSeconds: config.runner.warnSeconds,
    memoryMb: config.runner.memoryMb,
    cpus: config.runner.cpus,
    outputLimitBytes: config.runner.outputLimitBytes,
    ...(live ?? {}),
    cooldownRemainingRun: (await runs.cooldownRemaining(user, 'run')) ?? 0,
    cooldownRemainingTest: (await runs.cooldownRemaining(user, 'test')) ?? 0,
  });
}

// ── mock exams (V3, D7, D27, D28) ────────────────────────────────────────────

const EXAM_MINUTES_DEFAULT = 180;
const EXAM_MINUTES_MIN = 10;
const EXAM_MINUTES_MAX = 360;

/** D28: the routes still open while an exam runs. Exercise routes are checked against the exam's own exercises. */
function examAllows(exam: Exam, path: string, method: string): boolean {
  if (path === '/api/runner' || path === '/api/languages' || path.startsWith('/api/runs/')) return true;
  if (path === '/api/preferences') return true;
  // The editor saves and resets through /progress; inside an exam that is the exam's copy.
  const pr = /^\/api\/([a-z]+)\/progress\/([^/]+)$/.exec(path);
  if (pr) return pr[1] === exam.language && (method === 'PUT' || method === 'DELETE') && revealedItems(exam).some((i) => i.exercise_slug === pr[2]);
  const m = /^\/api\/([a-z]+)\/exercises\/([^/]+)(?:\/([a-z]+))?$/.exec(path);
  if (!m) return false;
  if (m[1] !== exam.language || !revealedItems(exam).some((i) => i.exercise_slug === m[2])) return false;
  const action = m[3];
  if (!action) return method === 'GET';
  return ['code', 'reset', 'format', 'run', 'test', 'submit'].includes(action);
}

function examFiles(ex: Exercise, exam: Exam): Record<string, string> {
  const item = exams.items(exam.id).find((i) => i.exercise_slug === ex.slug);
  return workingFiles(ex, item?.files ?? null);
}

/**
 * Levels open one at a time, like the real exam: a student sees the levels
 * passed and the current one, never what comes next — during the exam and in
 * its report afterwards.
 */
function revealedItems(exam: Exam) {
  const all = exams.items(exam.id);
  const current = all.findIndex((i) => i.passed_at === null);
  return current === -1 ? all : all.slice(0, current + 1);
}

function examView(exam: Exam) {
  const all = exams.items(exam.id);
  const total = all.length;
  const items = revealedItems(exam).map((i) => ({
    level: i.level,
    slug: i.exercise_slug,
    value: valueOf(exam.language, exam.checkpoint, i.exercise_slug),
    title: titleOf(exam.language, i.exercise_slug),
    submits: i.submits,
    passed: i.passed_at !== null,
    passedAt: i.passed_at,
  }));
  return {
    id: exam.id,
    language: exam.language,
    checkpoint: exam.checkpoint,
    minutes: exam.minutes,
    startedAt: exam.started_at,
    endsAt: exam.ends_at,
    endedAt: exam.ended_at,
    status: exam.status,
    passed: items.filter((i) => i.passed).length,
    total,
    // Percent (D35); optional pushes it above 100.
    mark: examMark(exam.language, exam.checkpoint, items),
    maxMark: examMaxMark(exam.language, exam.checkpoint, all.map((i) => i.exercise_slug)),
    items,
  };
}

function listExams(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const active = exams.active(caller.user.id);
  sendJson(res, 200, {
    active: active ? examView(active) : null,
    past: exams.list(caller.user.id).filter((e) => e.status !== 'active').map(examView),
  });
}

async function startExam(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const b = await body<{ language?: unknown; checkpoint?: unknown; minutes?: unknown }>(req, res);
  if (!b) return;
  if (typeof b.language !== 'string' || !isLanguage(b.language) || typeof b.checkpoint !== 'string') {
    sendError(res, 400, 'invalid_request', 'A track and a checkpoint are required.');
    return;
  }
  const minutes = b.minutes === undefined ? EXAM_MINUTES_DEFAULT : Number(b.minutes);
  if (!Number.isInteger(minutes) || minutes < EXAM_MINUTES_MIN || minutes > EXAM_MINUTES_MAX) {
    sendError(res, 400, 'invalid_minutes', `The timer must be ${EXAM_MINUTES_MIN}-${EXAM_MINUTES_MAX} minutes.`);
    return;
  }
  if (exams.active(caller.user.id)) {
    sendError(res, 409, 'exam_active', 'A mock exam is already running.');
    return;
  }
  const items = pickExamItems(b.language, b.checkpoint);
  if (items.length === 0) {
    sendError(res, 404, 'not_found', 'No such checkpoint.');
    return;
  }
  const exam = exams.create(caller.user.id, b.language, b.checkpoint, minutes, items);
  logger.info('exam.started', { userId: caller.user.id, language: exam.language, checkpoint: exam.checkpoint, examId: exam.id });
  sendJson(res, 200, examView(exam));
}

function getExam(req: IncomingMessage, res: ServerResponse, id: number): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  exams.active(caller.user.id); // closes it if its time is up
  const exam = exams.byId(caller.user.id, id);
  if (!exam) {
    sendError(res, 404, 'not_found', 'Not found.');
    return;
  }
  sendJson(res, 200, examView(exam));
}

async function endExam(req: IncomingMessage, res: ServerResponse, id: number): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const b = await body<{ abandon?: unknown }>(req, res);
  if (!b) return;
  const exam = exams.byId(caller.user.id, id);
  if (!exam) {
    sendError(res, 404, 'not_found', 'Not found.');
    return;
  }
  if (exam.status === 'active') {
    exams.close(caller.user.id, id, b.abandon === true ? 'abandoned' : 'finished');
    exams.active(caller.user.id);
    logger.info('exam.ended', { userId: caller.user.id, examId: id, abandoned: b.abandon === true });
  }
  sendJson(res, 200, examView(exams.byId(caller.user.id, id)!));
}

function examGetOne(req: IncomingMessage, res: ServerResponse, p: Params, exam: Exam): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  sendJson(res, 200, { ...publicView(ex), placements: ex.placements.map((pl) => placementView(ex.language, ex.slug, pl)), files: examFiles(ex, exam), starter: ex.starter, status: 'in_progress', examId: exam.id });
}

async function examSave(req: IncomingMessage, res: ServerResponse, p: Params, exam: Exam): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  const b = await body<{ files?: unknown; libRs?: unknown; mainRs?: unknown }>(req, res);
  if (!b) return;
  const files = filesFrom(ex, b);
  if (!files) {
    sendError(res, 400, 'invalid_files', `Only ${ex.editorFiles.join(' and ')} can be saved.`);
    return;
  }
  exams.saveFiles(exam.id, p.slug, files);
  sendJson(res, 200, { slug: p.slug, updatedAt: new Date().toISOString() });
}

function examReset(req: IncomingMessage, res: ServerResponse, p: Params, exam: Exam): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = exerciseFor(res, p);
  if (!ex) return;
  exams.saveFiles(exam.id, p.slug, ex.starter);
  sendJson(res, 200, { slug: p.slug, files: ex.starter });
}
