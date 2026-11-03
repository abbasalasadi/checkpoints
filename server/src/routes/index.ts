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
  sendError,
  sendJson,
  setSessionCookie,
  type Caller,
} from '../middleware/http.js';
import { attempts, progress, sessions, snapshots, users } from '../repositories/index.js';
import { assertUsername, InvalidCredentialsError, InvalidIdentifierError, signIn, UpstreamError } from '../services/auth.js';
import {
  getExercise,
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

  if (path === '/api/languages' && method === 'GET') return languages(req, res);

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
        if (!action && method === 'GET') return getOne(req, res, p);
        if (action === 'code' && !sub && method === 'PUT') return saveCode(req, res, p);
        if (action === 'reset' && !sub && method === 'POST') return resetCode(req, res, p);
        if (action === 'format' && !sub && method === 'POST') return formatCode(req, res, p);
        if ((action === 'run' || action === 'test' || action === 'submit') && !sub && method === 'POST') {
          return execute(req, res, p, action === 'run' ? 'run' : 'test');
        }
        if (action === 'attempts' && !sub && method === 'GET') return listAttempts(req, res, p);
        if (action === 'snapshots' && !sub && method === 'GET') return listSnapshots(req, res, p);
        if (action === 'snapshots' && !sub && method === 'POST') return createSnapshot(req, res, p);
        if (action === 'snapshots' && sub === 'restore' && method === 'POST') return restoreSnapshot(req, res, p);
      }
      // Rust reference shapes, language-prefixed.
      if (group === 'progress' && !action && method === 'PUT') return saveCode(req, res, p);
      if (group === 'progress' && !action && method === 'DELETE') return resetCode(req, res, p);
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
  const done = new Set(
    progress
      .listForUser(caller.user.id, lang)
      .filter((p) => p.status === 'passed')
      .map((p) => p.exercise_slug),
  );
  sendJson(res, 200, {
    language: lang,
    exercises: listExercises(lang).map((e) => ({ ...e, passed: done.has(e.slug) })),
    placements: placementsFor(lang),
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

async function execute(req: IncomingMessage, res: ServerResponse, p: Params, mode: runs.RunMode): Promise<void> {
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
    progress.save(caller.user.id, p.lang, p.slug, { files: posted });
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

  const saved = progress.get(caller.user.id, p.lang, p.slug);
  const files = workingFiles(ex, saved?.files);

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
  if (run) recordOnDone(caller, p, mode, run, files);

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

function recordOnDone(caller: Caller, p: Params, mode: runs.RunMode, run: runs.RunLike, files: Record<string, string>): void {
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
      });
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
