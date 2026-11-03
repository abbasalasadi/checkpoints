/**
 * Backend logger. Per docs/01-canonical.md:
 *   - writes var/logs/backend.log, truncated on start so each run is self-contained
 *   - dual sink: file plus stdout/stderr, so container logs keep working
 *   - gated by LOG_ENABLED and LOG_LEVEL, no code change needed to silence it
 *   - structured: timestamp, level, operation, context
 *   - never emits secrets; identifiers are redacted
 *
 * No raw console.log anywhere in a production path — use this.
 */

import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { dirname, join } from 'node:path';
import { config, type LogLevel } from './config/index.js';
import { fromRoot } from './config/paths.js';

const RANK: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

// Repo-root relative: npm workspaces set cwd to server/, which would otherwise
// scatter logs into server/var/logs.
const LOG_FILE = fromRoot(join(config.logDir, 'backend.log'));

let stream: WriteStream | null = null;

function sink(): WriteStream | null {
  if (!config.logEnabled) return null;
  if (stream) return stream;
  mkdirSync(dirname(LOG_FILE), { recursive: true });
  // 'w' truncates: each run's log stands alone.
  stream = createWriteStream(LOG_FILE, { flags: 'w' });
  return stream;
}

/**
 * Redact a student identifier to first two and last two characters.
 * Short values are fully masked rather than partially revealed.
 */
export function redactIdentifier(value: string | undefined | null): string {
  const v = (value ?? '').trim();
  if (v === '') return 'empty';
  if (v.length <= 4) return '***';
  return `${v.slice(0, 2)}${'*'.repeat(v.length - 4)}${v.slice(-2)}`;
}

/** Keys whose values must never reach a log line, at any level. */
const FORBIDDEN = /^(password|token|secret|key|authorization|cookie|session)/i;

function safeContext(context: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(context)) {
    out[k] = FORBIDDEN.test(k) ? '[redacted]' : v;
  }
  return out;
}

function emit(lvl: LogLevel, operation: string, context: Record<string, unknown> = {}) {
  if (!config.logEnabled) return;
  if (RANK[lvl] < RANK[config.logLevel]) return;

  const entry = {
    ts: new Date().toISOString(),
    level: lvl,
    op: operation,
    ...safeContext(context),
  };
  const line = JSON.stringify(entry);

  sink()?.write(`${line}\n`);
  if (lvl === 'error' || lvl === 'warn') process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const logger = {
  debug: (op: string, ctx?: Record<string, unknown>) => emit('debug', op, ctx),
  info: (op: string, ctx?: Record<string, unknown>) => emit('info', op, ctx),
  warn: (op: string, ctx?: Record<string, unknown>) => emit('warn', op, ctx),
  error: (op: string, ctx?: Record<string, unknown>) => emit('error', op, ctx),
  logFile: LOG_FILE,
};
