/**
 * API client. Every call is same-origin: Vite proxies /api to the backend in
 * development and nginx does in production, so the session cookie travels
 * without CORS and stays httpOnly.
 */
import { logger } from '../logger.js';

export interface ApiError {
  code: string;
  message: string;
  secondsRemaining?: number;
}

export class ApiFailure extends Error {
  constructor(
    public readonly status: number,
    public readonly error: ApiError,
  ) {
    super(error.message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    credentials: 'same-origin',
  });
  const text = await res.text();
  const body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const err = (body.error ?? { code: 'unknown', message: 'Request failed.' }) as ApiError;
    if (typeof body.secondsRemaining === 'number') err.secondsRemaining = body.secondsRemaining;
    logger.warn('api.error', { path, status: res.status, code: err.code });
    throw new ApiFailure(res.status, err);
  }
  return body as T;
}

export interface ExerciseSummary {
  slug: string;
  kind: 'lib' | 'bin';
  argv: boolean;
  passed: boolean;
}
export interface Placement {
  exercise: string;
  checkpoint: string;
  level: number;
}
export interface ExerciseDetail {
  slug: string;
  kind: 'lib' | 'bin';
  argv: boolean;
  readme: string;
  placements: { checkpoint: string; level: number }[];
  libRs: string | null;
  mainRs: string;
  status: 'in_progress' | 'passed';
}
export interface SnapshotMeta {
  id: number;
  kind: 'manual' | 'passing';
  createdAt: string;
}

/**
 * How the run ended, in one word.
 *
 * The exit code alone cannot distinguish these: 101 covers a compile error, a
 * panic and a failing test alike, and a killed process says nothing about why.
 */
export type RunOutcome =
  | 'ok'
  | 'timeout'
  | 'output_limit'
  | 'out_of_memory'
  | 'cancelled'
  /** Client-side only: the server refused the run (503), so nothing ever ran. */
  | 'runner_error';

export interface RunResult {
  exitCode: number;
  output: string;
  durationMs: number;
  passed?: boolean;
  outcome?: RunOutcome;
  /** Present when outcome is 'timeout'. */
  timeoutSeconds?: number;
  /** More arguments were supplied than the runner accepts. */
  argsTruncated?: boolean;
  maxArgs?: number;
  /** How long the server will refuse another run OF THIS KIND for. The other kind is unaffected. */
  cooldownSeconds: number;
}

export const api = {
  me: () => request<{ identifier: string }>('/api/me'),
  login: (identifier: string, password: string) =>
    request<{ identifier: string }>('/api/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
  logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  exercises: () => request<{ exercises: ExerciseSummary[]; placements: Placement[] }>('/api/exercises'),
  exercise: (slug: string) => request<ExerciseDetail>(`/api/exercises/${slug}`),
  save: (slug: string, files: { libRs?: string; mainRs?: string }) =>
    request<{ slug: string }>(`/api/progress/${slug}`, { method: 'PUT', body: JSON.stringify(files) }),
  /** Discard saved code so the exercise serves its starter again. */
  reset: (slug: string) => request<{ slug: string }>(`/api/progress/${slug}`, { method: 'DELETE' }),
  snapshots: (slug: string) => request<{ snapshots: SnapshotMeta[] }>(`/api/snapshots/${slug}`),
  saveSnapshot: (slug: string) =>
    request<SnapshotMeta>(`/api/snapshots/${slug}`, { method: 'POST', body: JSON.stringify({}) }),
  restoreSnapshot: (slug: string, id: number) =>
    request<{ kind: 'manual' | 'passing'; libRs: string | null; mainRs: string }>(
      `/api/snapshots/${slug}/restore`,
      { method: 'POST', body: JSON.stringify({ id }) },
    ),
  run: (slug: string, args: string[]) =>
    request<RunResult>(`/api/exercises/${slug}/run`, { method: 'POST', body: JSON.stringify({ args }) }),
  test: (slug: string) =>
    request<RunResult>(`/api/exercises/${slug}/test`, { method: 'POST', body: JSON.stringify({}) }),
  /** Stop the run in flight. Resolves false if it had already finished. */
  cancelRun: () => request<{ cancelled: boolean }>('/api/runner/cancel', { method: 'POST' }),
  runnerState: () =>
    request<{
      activeRuns: number;
      queueDepth: number;
      queued: boolean;
      /** Run and Test throttle on separate clocks — see runner.ts cooldownFor(). */
      cooldownRemainingRun: number;
      cooldownRemainingTest: number;
      maxConcurrent: number;
      /** When a run will be stopped, so the UI can count down to it. */
      timeoutSeconds: number;
      /** When to warn that a run looks stuck, well before it is stopped. */
      warnSeconds: number;
    }>('/api/runner'),
};
