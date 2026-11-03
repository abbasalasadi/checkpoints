/**
 * Routing and handlers.
 *
 * Ownership rule applied throughout: the acting user comes from the session,
 * and every read or write is scoped to it. A row belonging to someone else
 * returns 404, never 403, so its existence is not revealed.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config/index.js';
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
} from '../middleware/http.js';
import { attempts, progress, sessions, snapshots, users } from '../repositories/index.js';
import { InvalidCredentialsError, InvalidIdentifierError, signIn, UpstreamError } from '../services/auth.js';
import { getExercise, listExercises, materialiseFiles, placements } from '../services/exercises.js';
// Runner is imported as a value too: cooldownFor() is read here so the window the
// client counts down and the window the server enforces cannot drift apart.
import { CooldownError, Runner, RunTimeoutError, runner } from '../services/runner.js';

const loginLimiter = new RateLimiter(10, 5 * 60_000);

export async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;
  const method = req.method ?? 'GET';

  // Unauthenticated liveness probe — the deploy health check polls it.
  if (path === '/healthz' && method === 'GET') {
    sendJson(res, 200, { status: 'ok', app: config.appName });
    return;
  }

  if (path === '/api/login' && method === 'POST') return login(req, res);
  if (path === '/api/logout' && method === 'POST') return logout(req, res);
  if (path === '/api/me' && method === 'GET') return me(req, res);
  if (path === '/api/exercises' && method === 'GET') return listAll(req, res);

  const exerciseMatch = /^\/api\/exercises\/([a-z0-9_]+)$/.exec(path);
  if (exerciseMatch?.[1] && method === 'GET') return getOne(req, res, exerciseMatch[1]);

  if (path === '/api/progress' && method === 'GET') return listProgress(req, res);

  const progressMatch = /^\/api\/progress\/([a-z0-9_]+)$/.exec(path);
  if (progressMatch?.[1] && method === 'PUT') return saveProgress(req, res, progressMatch[1]);
  if (progressMatch?.[1] && method === 'DELETE') return resetProgress(req, res, progressMatch[1]);

  const runMatch = /^\/api\/exercises\/([a-z0-9_]+)\/(run|test)$/.exec(path);
  if (runMatch?.[1] && runMatch[2] && method === 'POST') {
    return execute(req, res, runMatch[1], runMatch[2] as 'run' | 'test');
  }

  const snapMatch = /^\/api\/snapshots\/([a-z0-9_]+)$/.exec(path);
  if (snapMatch?.[1] && method === 'GET') return listSnapshots(req, res, snapMatch[1]);
  if (snapMatch?.[1] && method === 'POST') return createSnapshot(req, res, snapMatch[1]);

  const restoreMatch = /^\/api\/snapshots\/([a-z0-9_]+)\/restore$/.exec(path);
  if (restoreMatch?.[1] && method === 'POST') return restoreSnapshot(req, res, restoreMatch[1]);

  if (path === '/api/runner' && method === 'GET') return runnerState(req, res);
  if (path === '/api/runner/cancel' && method === 'POST') return cancelRun(req, res);

  sendError(res, 404, 'not_found', 'Not found.');
}

// ── auth ─────────────────────────────────────────────────────────────────────

async function login(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const ip = clientIp(req, config.appEnv === 'production');
  const limit = loginLimiter.check(ip);
  if (!limit.allowed) {
    res.setHeader('Retry-After', String(limit.retryAfterSeconds));
    sendError(res, 429, 'rate_limited', 'Too many attempts. Try again shortly.');
    return;
  }

  let body: { identifier?: string; password?: string };
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, 'invalid_request', String(err).includes('large') ? 'Payload too large.' : 'Invalid request.');
    return;
  }

  const identifier = (body.identifier ?? '').trim();
  const password = body.password ?? '';
  if (identifier === '' || password === '') {
    sendError(res, 400, 'invalid_request', 'Identifier and password are required.');
    return;
  }

  try {
    const result = await signIn(identifier, password);
    const user = users.upsertOnLogin(identifier, result.rebootUserId, result.claims);
    const session = sessions.create(user.id, config.sessionTtlHours, req.headers['user-agent'] ?? null);
    setSessionCookie(res, session.id, config.sessionTtlHours);
    logger.info('login.ok', { userId: user.id, identifier: redactIdentifier(identifier) });
    // The upstream token is deliberately not returned or stored: it proves
    // enrolment and nothing else, and we do not call reboot01's API.
    sendJson(res, 200, { identifier: user.identifier_normalized });
  } catch (err) {
    if (err instanceof InvalidIdentifierError) {
      // A format problem, not a credential problem: saying so is not
      // enumeration, because it reveals nothing about whether an account exists.
      sendError(res, 400, 'invalid_identifier', err.message);
      return;
    }
    if (err instanceof InvalidCredentialsError) {
      // One generic message regardless of which factor failed — anti-enumeration.
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

function logout(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  // Revokes THIS session only — a student signed in elsewhere stays signed in.
  sessions.revoke(caller.sessionId);
  clearSessionCookie(res);
  logger.info('logout.ok', { userId: caller.user.id });
  sendJson(res, 200, { ok: true });
}

function me(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  sendJson(res, 200, { identifier: caller.user.identifier_normalized });
}

// ── content ──────────────────────────────────────────────────────────────────

function listAll(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const done = new Set(
    progress.listForUser(caller.user.id).filter((p) => p.status === 'passed').map((p) => p.exercise_slug),
  );
  sendJson(res, 200, {
    exercises: listExercises().map((e) => ({ ...e, passed: done.has(e.slug) })),
    placements,
  });
}

function getOne(req: IncomingMessage, res: ServerResponse, slug: string): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = getExercise(slug);
  if (!ex) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return;
  }
  const saved = progress.get(caller.user.id, slug);
  sendJson(res, 200, {
    slug: ex.slug,
    kind: ex.kind,
    argv: ex.argv,
    readme: ex.readme,
    placements: ex.placements,
    libRs: ex.kind === 'lib' ? (saved?.lib_rs ?? ex.starter) : null,
    mainRs: ex.kind === 'lib' ? (saved?.main_rs ?? ex.mainRs) : (saved?.main_rs ?? ex.starter),
    // The test crate is deliberately NOT sent. Hiding it in the UI while still
    // shipping it would be cosmetic — it would sit in the network response for
    // anyone who opened devtools. The server writes it into the container fresh
    // on every run, so it never needs to reach the browser.
    status: saved?.status ?? 'in_progress',
  });
}

// ── progress ─────────────────────────────────────────────────────────────────

function listProgress(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  sendJson(res, 200, {
    progress: progress.listForUser(caller.user.id).map((p) => ({
      slug: p.exercise_slug,
      status: p.status,
      updatedAt: p.updated_at,
    })),
  });
}

async function saveProgress(req: IncomingMessage, res: ServerResponse, slug: string): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!getExercise(slug)) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return;
  }

  let body: { libRs?: string; mainRs?: string };
  try {
    body = await readJsonBody(req);
  } catch (err) {
    sendError(res, 400, 'invalid_request', String(err).includes('large') ? 'Payload too large.' : 'Invalid request.');
    return;
  }

  // Explicit allow-list. user_id, status and timestamps are not client-writable.
  const saved = progress.save(caller.user.id, slug, {
    libRs: typeof body.libRs === 'string' ? body.libRs : undefined,
    mainRs: typeof body.mainRs === 'string' ? body.mainRs : undefined,
  });
  sendJson(res, 200, { slug: saved.exercise_slug, updatedAt: saved.updated_at });
}

/**
 * Discard the student's saved code for one exercise.
 *
 * Reset has to happen here rather than in the client: re-fetching the exercise
 * returns the saved code, so a purely client-side reset handed the student back
 * exactly what they already had and looked like a dead button.
 */
function resetProgress(req: IncomingMessage, res: ServerResponse, slug: string): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!getExercise(slug)) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return;
  }
  progress.clearCode(caller.user.id, slug);
  logger.info('progress.reset', { userId: caller.user.id, slug });
  sendJson(res, 200, { slug });
}

// ── snapshots ────────────────────────────────────────────────────────────────

/** Metadata only — the code itself is fetched by restoring. */
function listSnapshots(req: IncomingMessage, res: ServerResponse, slug: string): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!getExercise(slug)) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return;
  }
  sendJson(res, 200, {
    snapshots: snapshots.list(caller.user.id, slug).map((s) => ({
      id: s.id,
      kind: s.kind,
      createdAt: s.created_at,
    })),
  });
}

/** Save a copy of the working code the student can come back to. */
function createSnapshot(req: IncomingMessage, res: ServerResponse, slug: string): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  if (!getExercise(slug)) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return;
  }
  const working = progress.get(caller.user.id, slug);
  if (!working || (working.lib_rs === null && working.main_rs === null)) {
    sendError(res, 400, 'nothing_to_save', 'There is nothing to save yet.');
    return;
  }
  const snap = snapshots.saveManual(caller.user.id, slug, working.lib_rs, working.main_rs);
  logger.info('snapshot.created', { userId: caller.user.id, slug, id: snap.id });
  sendJson(res, 200, { id: snap.id, kind: snap.kind, createdAt: snap.created_at });
}

/**
 * Copy a snapshot back over the working code.
 *
 * Restoring writes into `progress` rather than only into the editor, so what
 * Run and Submit execute matches what the student is now looking at.
 */
async function restoreSnapshot(req: IncomingMessage, res: ServerResponse, slug: string): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const ex = getExercise(slug);
  if (!ex) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return;
  }

  let body: { id?: number } = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }
  if (typeof body.id !== 'number') {
    sendError(res, 400, 'invalid_request', 'A snapshot id is required.');
    return;
  }

  // byId is scoped to the caller, so another student's snapshot is simply not
  // found rather than forbidden — its existence is not revealed.
  const snap = snapshots.byId(caller.user.id, body.id);
  if (!snap || snap.exercise_slug !== slug) {
    sendError(res, 404, 'not_found', 'Snapshot not found.');
    return;
  }

  progress.save(caller.user.id, slug, { libRs: snap.lib_rs, mainRs: snap.main_rs });
  logger.info('snapshot.restored', { userId: caller.user.id, slug, id: snap.id, kind: snap.kind });
  sendJson(res, 200, {
    kind: snap.kind,
    libRs: ex.kind === 'lib' ? (snap.lib_rs ?? ex.starter) : null,
    mainRs: ex.kind === 'lib' ? (snap.main_rs ?? ex.mainRs) : (snap.main_rs ?? ex.starter),
  });
}

// ── run / test ───────────────────────────────────────────────────────────────

async function execute(
  req: IncomingMessage,
  res: ServerResponse,
  slug: string,
  kind: 'run' | 'test',
): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;

  const ex = getExercise(slug);
  if (!ex) {
    sendError(res, 404, 'not_found', 'Exercise not found.');
    return;
  }

  let body: { args?: string[] } = {};
  try {
    body = await readJsonBody(req);
  } catch {
    body = {};
  }

  const cooling = runner.cooldownRemaining(String(caller.user.id), kind);
  if (cooling > 0) {
    res.setHeader('Retry-After', String(cooling));
    sendJson(res, 429, {
      error: { code: 'cooling_down', message: `Ready in ${cooling}s.` },
      secondsRemaining: cooling,
    });
    return;
  }

  const saved = progress.get(caller.user.id, slug);
  const files = materialiseFiles(ex, { libRs: saved?.lib_rs, mainRs: saved?.main_rs });

  try {
    const userKey = String(caller.user.id);
    await runner.writeFiles(userKey, files);

    // Extra arguments were silently discarded; the student is now told.
    const MAX_ARGS = 16;
    const requestedArgs = body.args ?? [];
    const args = requestedArgs.slice(0, MAX_ARGS);
    const argsTruncated = requestedArgs.length > MAX_ARGS;

    const cmd =
      kind === 'test'
        ? ['cargo', 'test', '--offline', '--color', 'always']
        : ['cargo', 'run', '--offline', '--color', 'always', '--', ...args];
    const cwd = kind === 'test' ? `/workspace/${slug}_test` : `/workspace/${slug}`;

    const result = await runner.exec(userKey, cmd, { cwd, kind });
    attempts.record(caller.user.id, slug, kind, result.exitCode, result.durationMs);

    // Pass/fail is the exit code, not parsed output.
    if (kind === 'test' && result.exitCode === 0) {
      progress.save(caller.user.id, slug, { status: 'passed' });
      // Keep the code that passed, so a later refactor that breaks it has
      // something to fall back to.
      snapshots.savePassing(caller.user.id, slug, saved?.lib_rs ?? null, saved?.main_rs ?? null);
    }

    sendJson(res, 200, {
      exitCode: result.exitCode,
      output: result.output,
      durationMs: result.durationMs,
      passed: kind === 'test' ? result.exitCode === 0 : undefined,
      // What happened, in one word, so the client can say something specific
      // instead of inferring it from an exit code. 137 is SIGKILL, which for a
      // memory-capped container means the cgroup OOM killer.
      outcome: result.cancelled
        ? 'cancelled'
        : result.truncated
          ? 'output_limit'
          : result.oomKilled
            ? 'out_of_memory'
            : 'ok',
      argsTruncated,
      maxArgs: MAX_ARGS,
      // The client disables THIS button for this long. Run and Test throttle on
      // separate clocks, so the window depends on which one was pressed — a
      // shared one would make Run block Test and read as a dead button.
      cooldownSeconds: Runner.cooldownFor(kind),
    });
  } catch (err) {
    if (err instanceof CooldownError) {
      res.setHeader('Retry-After', String(err.secondsRemaining));
      sendJson(res, 429, {
        error: { code: 'cooling_down', message: `Ready in ${err.secondsRemaining}s.` },
        secondsRemaining: err.secondsRemaining,
      });
      return;
    }
    // A timeout is a fact about the student's program, not a failure of ours,
    // so it comes back as a result with an outcome rather than a 503 blaming
    // the infrastructure for their infinite loop.
    if (err instanceof RunTimeoutError) {
      attempts.record(caller.user.id, slug, kind, -1, err.seconds * 1000);
      sendJson(res, 200, {
        exitCode: -1,
        output: '',
        durationMs: err.seconds * 1000,
        passed: kind === 'test' ? false : undefined,
        outcome: 'timeout',
        timeoutSeconds: err.seconds,
        argsTruncated: false,
        maxArgs: 16,
        cooldownSeconds: Runner.cooldownFor(kind),
      });
      return;
    }
    logger.error('run.failed', { userId: caller.user.id, slug, kind, error: String(err) });
    sendError(
      res,
      503,
      'runner_unavailable',
      'Something went wrong on our side, not in your code. Please try again in a moment.',
    );
  }
}

async function cancelRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const caller = requireCaller(req, res);
  if (!caller) return;
  const stopped = await runner.cancel(String(caller.user.id));
  // 200 either way: "there was nothing to cancel" is a normal race, not an
  // error — the run can finish between the click and the request arriving.
  sendJson(res, 200, { cancelled: stopped });
}

function runnerState(req: IncomingMessage, res: ServerResponse): void {
  const caller = requireCaller(req, res);
  if (!caller) return;
  sendJson(res, 200, {
    activeRuns: runner.activeRuns,
    queueDepth: runner.queueDepth,
    /** Whether THIS student is waiting for a slot, as opposed to executing. */
    queued: runner.isQueued(String(caller.user.id)),
    /** So the client can count down to the moment a run will be stopped. */
    timeoutSeconds: config.runner.timeoutSeconds,
    /** When to warn that a run looks stuck, well before it is stopped. */
    warnSeconds: config.runner.warnSeconds,
    // Both clocks, so the client can gate each button independently.
    cooldownRemainingRun: runner.cooldownRemaining(String(caller.user.id), 'run'),
    cooldownRemainingTest: runner.cooldownRemaining(String(caller.user.id), 'test'),
    maxConcurrent: config.runner.maxConcurrent,
  });
}
