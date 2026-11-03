/**
 * Transport helpers: the single error shape, session resolution, and the login
 * rate limiter. No business logic here.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { config } from '../config/index.js';
import { logger } from '../logger.js';
import { sessions, users, type User } from '../repositories/index.js';

export const SESSION_COOKIE = 'rc_session';

/** Every error in the API has this shape (docs/01-canonical.md). */
export function sendError(res: ServerResponse, status: number, code: string, message: string): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: { code, message } }));
}

export function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
}

/** Body reader with a hard size limit — an unbounded read is a denial of service. */
export function readJsonBody<T>(req: IncomingMessage, maxBytes = 256 * 1024): Promise<T> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as T);
      } catch {
        reject(new Error('invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? '').split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    out[part.slice(0, idx).trim()] = decodeURIComponent(part.slice(idx + 1).trim());
  }
  return out;
}

export function setSessionCookie(res: ServerResponse, sessionId: string, ttlHours: number): void {
  // httpOnly: this site renders student-authored program output, so anything
  // reachable from page scripts is at risk (docs/05-backend.md).
  const attrs = [
    `${SESSION_COOKIE}=${sessionId}`,
    'HttpOnly',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${ttlHours * 3600}`,
  ];
  if (config.appEnv === 'production') attrs.push('Secure');
  res.setHeader('Set-Cookie', attrs.join('; '));
}

export function clearSessionCookie(res: ServerResponse): void {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export interface Caller {
  user: User;
  sessionId: string;
}

/**
 * Resolve the caller from the session cookie.
 *
 * The acting user comes from here and nowhere else — never from a request body,
 * query parameter, or header the client controls.
 */
export function resolveCaller(req: IncomingMessage): Caller | null {
  const cookies = parseCookies(req.headers.cookie);
  const sid = cookies[SESSION_COOKIE];
  if (!sid) return null;
  const session = sessions.findValid(sid);
  if (!session) return null;
  const user = users.byId(session.user_id);
  if (!user) return null;
  sessions.touch(sid);
  return { user, sessionId: sid };
}

export function requireCaller(req: IncomingMessage, res: ServerResponse): Caller | null {
  const caller = resolveCaller(req);
  if (!caller) {
    sendError(res, 401, 'unauthenticated', 'Sign in to continue.');
    return null;
  }
  return caller;
}

/**
 * Client IP, honouring X-Forwarded-For only from the known proxy.
 *
 * Trusting the header unconditionally would let anyone spoof their IP and walk
 * straight through the rate limiter.
 */
export function clientIp(req: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const fwd = req.headers['x-forwarded-for'];
    const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.socket.remoteAddress ?? 'unknown';
}

/** Fixed-window limiter, enough for login abuse and nothing more. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
  ) {}

  check(key: string): { allowed: boolean; retryAfterSeconds: number } {
    const nowMs = Date.now();
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= nowMs) {
      this.hits.set(key, { count: 1, resetAt: nowMs + this.windowMs });
      return { allowed: true, retryAfterSeconds: 0 };
    }
    entry.count += 1;
    if (entry.count > this.max) {
      logger.warn('ratelimit.exceeded', { key, count: entry.count });
      return { allowed: false, retryAfterSeconds: Math.ceil((entry.resetAt - nowMs) / 1000) };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }
}
