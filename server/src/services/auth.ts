/**
 * reboot01 authentication.
 *
 * Protocol (docs/A3-reboot01-auth.md), ported from the Go reference:
 *   POST <signin url> with `Authorization: Basic base64(identifier:password)`
 *   and NO request body. The response body IS the token — a bare string, not
 *   JSON — so it must be trimmed of whitespace and then of surrounding quotes.
 *
 * The token proves enrolment and nothing more. We do not call reboot01's
 * GraphQL API, so it is discarded immediately after the claims are inspected.
 */

import { config } from '../config/index.js';
import { logger, redactIdentifier } from '../logger.js';

export class InvalidCredentialsError extends Error {
  constructor() {
    super('invalid credentials');
    this.name = 'InvalidCredentialsError';
  }
}

export class InvalidIdentifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidIdentifierError';
  }
}

/**
 * Only a reboot01 username is accepted — never an email address.
 *
 * Enforced here rather than in the form, because the frontend is bypassable:
 * anything that only checks in the browser is not a rule. Deliberately narrow —
 * it rejects what an email definitely is (an `@`) and what a username definitely
 * is not (whitespace), instead of guessing the exact permitted character set and
 * locking out a legitimate student.
 */
export function assertUsername(identifier: string): void {
  const value = identifier.trim();
  if (value === '') {
    throw new InvalidIdentifierError('Enter your reboot01 username.');
  }
  if (value.includes('@')) {
    throw new InvalidIdentifierError('Use your reboot01 username, not your email address.');
  }
  if (/\s/.test(value)) {
    throw new InvalidIdentifierError('A username cannot contain spaces.');
  }
  if (value.length > 64) {
    throw new InvalidIdentifierError('That username is too long.');
  }
}

export class UpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/**
 * Decode a JWT payload for INSPECTION ONLY.
 *
 * The signature cannot be verified — we have no public key — so this is never a
 * trust decision. Trust comes from having performed the signin ourselves.
 */
export function decodeClaims(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const json = Buffer.from(parts[1], 'base64url').toString('utf8');
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Best-effort user id from the claims.
 *
 * The real claim name is unknown, so several candidates are tried and null is a
 * perfectly good answer — identity is keyed on the identifier the student typed.
 * Once the true name is known from captured claims, it can be promoted here.
 */
export function extractRebootUserId(claims: Record<string, unknown> | null): string | null {
  if (!claims) return null;
  const direct = ['sub', 'userId', 'user_id', 'x-hasura-user-id'];
  for (const key of direct) {
    const v = claims[key];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  const hasura = claims['https://hasura.io/jwt/claims'];
  if (hasura && typeof hasura === 'object') {
    const v = (hasura as Record<string, unknown>)['x-hasura-user-id'];
    if (typeof v === 'string' && v !== '') return v;
    if (typeof v === 'number') return String(v);
  }
  return null;
}

export interface SignInResult {
  token: string;
  claims: Record<string, unknown> | null;
  rebootUserId: string | null;
}

export async function signIn(identifier: string, password: string): Promise<SignInResult> {
  // Checked before the credentials leave this process: an email address is
  // never a valid reboot01 identifier, so there is nothing to ask upstream.
  assertUsername(identifier);

  const url = config.platformSigninUrl;
  const credentials = Buffer.from(`${identifier}:${password}`, 'utf8').toString('base64');

  logger.info('auth.signin.begin', { identifier: redactIdentifier(identifier) });

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.error('auth.signin.unreachable', { error: String(err) });
    throw new UpstreamError('authentication upstream unreachable');
  }

  const body = await response.text();

  if (response.status === 401 || response.status === 403) {
    logger.warn('auth.signin.rejected', { status: response.status });
    throw new InvalidCredentialsError();
  }
  if (!response.ok) {
    logger.error('auth.signin.unexpected_status', { status: response.status });
    throw new UpstreamError(`unexpected upstream status ${response.status}`);
  }

  // The body is the token itself: trim whitespace, then the surrounding quotes.
  const token = body.trim().replace(/^"+|"+$/g, '');
  if (token === '') {
    logger.error('auth.signin.empty_token', {});
    throw new UpstreamError('upstream returned an empty token');
  }

  const claims = decodeClaims(token);
  const rebootUserId = extractRebootUserId(claims);

  // Claim KEY NAMES only, never values. This is how the real shape gets
  // discovered from live use instead of guessed.
  logger.info('auth.signin.ok', {
    identifier: redactIdentifier(identifier),
    claimKeys: claims ? Object.keys(claims).sort() : [],
    rebootUserIdFound: rebootUserId !== null,
  });

  return { token, claims, rebootUserId };
}
