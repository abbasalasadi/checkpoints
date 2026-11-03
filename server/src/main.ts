/**
 * Backend entry point.
 *
 * Startup order is specified in docs/05-backend.md and matters:
 *   1. load config (defaults, then environment)
 *   2. fail fast on missing required secrets, unreachable Docker, missing image
 *   3. truncate the log so the run is self-contained
 *   4. open SQLite and run pending migrations, aborting on any failure
 *   5. bind API_PORT
 *
 * The server is API-only. Vite serves the SPA in development and nginx serves
 * the built bundle in production.
 */

import { createServer } from 'node:http';
import { config, loadSecrets } from './config/index.js';
import { closeDatabase, migrate, openDatabase } from './db/index.js';
import { isLanguage, LANGUAGES, type Language } from './languages.js';
import { logger } from './logger.js';
import { handle } from './routes/index.js';
import { createRunSocketServer, RUN_SOCKET_PATTERN } from './routes/run-socket.js';
import { createTerminalServer } from './routes/terminal.js';
import './services/exercises.js';
import { lifecycle } from './services/runs.js';

async function main() {
  // Step 2a — abort now on a missing required secret (none today: D6).
  loadSecrets();

  // Step 3 — the first write truncates the file.
  logger.info('startup.begin', {
    app: config.appName,
    env: config.appEnv,
    logLevel: config.logLevel,
    repoRoot: config.repoRoot,
  });

  // Step 4 — a half-migrated schema must never serve traffic.
  openDatabase();
  try {
    const applied = migrate();
    logger.info('startup.migrations', {
      applied: applied.length,
      versions: applied,
    });
  } catch (err) {
    logger.error('startup.migrations_failed', { error: String(err) });
    process.stderr.write(`\n[FATAL] Database migration failed: ${String(err)}\n\n`);
    process.exit(1);
  }

  // Step 2b — the run dispatcher (services/runner/). A broken one should
  // surface here, not on a student's first click.
  const dispatcher = await lifecycle();
  if (!dispatcher) {
    process.stderr.write('\n[FATAL] Run dispatcher (services/runner/index.js) failed to load.\n\n');
    process.exit(1);
  }
  // RUNNER_LANGUAGES (comma list, default all) names the backends to check.
  // Production is strict: any configured backend missing aborts startup.
  // Elsewhere a missing image is a warning, so a laptop without every runner
  // image can still serve content; runs for that language fail at run time.
  const wanted = (process.env.RUNNER_LANGUAGES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(isLanguage);
  const runnerLanguages: Language[] = wanted.length ? wanted : [...LANGUAGES];
  const strict = config.appEnv === 'production';
  const failures: string[] = [];
  for (const lang of runnerLanguages) {
    try {
      await dispatcher.preflightRunners?.([lang]);
    } catch (err) {
      failures.push(String(err instanceof Error ? err.message : err));
      logger.warn('startup.runner_missing', { language: lang, error: String(err) });
    }
  }
  if (failures.length && strict) {
    logger.error('startup.runner_unavailable', { error: failures.join('; ') });
    process.stderr.write(
      `\n[FATAL] Runner unavailable: ${failures.join('; ')}\n` + `        Start Docker and build the runner images.\n\n`,
    );
    process.exit(1);
  }
  if (failures.length) {
    process.stderr.write(`[WARN] Runner preflight failed (continuing, APP_ENV=${config.appEnv}): ${failures.join('; ')}\n`);
  }
  dispatcher.startRunners?.();

  const runSocket = createRunSocketServer();
  const terminal = createTerminalServer();

  const server = createServer((req, res) => {
    const started = Date.now();
    res.on('finish', () => {
      logger.debug('http.request', {
        method: req.method,
        url: req.url,
        status: res.statusCode,
        ms: Date.now() - started,
      });
    });
    void handle(req, res).catch((err) => {
      logger.error('http.unhandled', { url: req.url, error: String(err) });
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'internal_error', message: 'Something went wrong.' } }));
      }
    });
  });

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const runMatch = RUN_SOCKET_PATTERN.exec(url.pathname);
    if (runMatch?.[1]) {
      void runSocket.upgrade(req, socket, head, runMatch[1]);
    } else if (url.pathname === terminal.path) {
      void terminal.upgrade(req, socket, head);
    } else {
      socket.destroy();
    }
  });

  server.listen(config.apiPort, '127.0.0.1', () => {
    logger.info('startup.listening', { port: config.apiPort, host: '127.0.0.1' });
  });

  let shuttingDown = false;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      if (shuttingDown) return;
      shuttingDown = true;
      logger.info('shutdown.begin', { signal });
      server.close(() => {
        void Promise.allSettled([dispatcher.stopRunners?.()]).finally(() => {
          closeDatabase();
          logger.info('shutdown.complete', {});
          process.exit(0);
        });
      });
      // Do not wait forever for lingering connections.
      setTimeout(() => process.exit(0), 10_000).unref();
    });
  }
}

main().catch((err) => {
  process.stderr.write(`\n[FATAL] ${String(err)}\n\n`);
  process.exit(1);
});
