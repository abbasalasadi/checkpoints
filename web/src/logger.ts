/**
 * Frontend logger. Mirrors the backend contract from docs/01-canonical.md:
 * gated by an env toggle, structured, never emits secrets.
 *
 * A browser cannot write var/logs/frontend.log itself. Vite writes its own
 * process output there via `make run`; anything the app needs persisted is
 * POSTed to the backend, which owns the file. Until that endpoint exists
 * (phase 05) this logs to the console only.
 *
 * No raw console.log in app code — use this, so the sink can change once
 * without touching call sites.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const RANK: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const enabled = (import.meta.env.VITE_LOG_ENABLED ?? 'true') !== 'false';
const threshold = (import.meta.env.VITE_LOG_LEVEL ?? 'info') as Level;

const FORBIDDEN = /^(password|token|secret|key|authorization|cookie|session)/i;

function safe(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = FORBIDDEN.test(k) ? '[redacted]' : v;
  }
  return out;
}

function emit(level: Level, operation: string, context: Record<string, unknown> = {}) {
  if (!enabled) return;
  if (RANK[level] < (RANK[threshold] ?? RANK.info)) return;

  const entry = { ts: new Date().toISOString(), level, op: operation, ...safe(context) };
  const line = JSON.stringify(entry);

  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (op: string, ctx?: Record<string, unknown>) => emit('debug', op, ctx),
  info: (op: string, ctx?: Record<string, unknown>) => emit('info', op, ctx),
  warn: (op: string, ctx?: Record<string, unknown>) => emit('warn', op, ctx),
  error: (op: string, ctx?: Record<string, unknown>) => emit('error', op, ctx),
};
