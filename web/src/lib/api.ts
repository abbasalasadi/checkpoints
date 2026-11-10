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

/** V5 admin view (D36-D39). */
export type AdminRange = 'today' | '7d' | '30d';
export interface AdminOverview {
  range: AdminRange;
  since: string;
  generatedAt: string;
  usage: {
    students: number;
    activeToday: number;
    active7d: number;
    active30d: number;
    newAccounts: number;
    runs: number;
    submits: number;
    days: { day: string; runs: number; submits: number }[];
    topExercises: { language: Language; slug: string; attempts: number; passes: number }[];
    exams: { started: number; active: number; finished: number; expired: number; abandoned: number };
  };
  online: { username: string; lastSeenAt: string; language: Language | null; slug: string | null; inExam: boolean }[];
  performance: {
    languages: { language: Language; runs: number; submits: number; medianMs: number | null; p95Ms: number | null; systemFailureRate: number }[];
    busiestHours: number[];
  };
  server: { uptimeSeconds: number; memoryMb: number; dbSizeBytes: number; lastBackupAt: string | null };
}

export interface AdminUserRow {
  username: string;
  joinedAt: string;
  lastActiveAt: string | null;
  submits: number;
  submitsPassed: number;
  exercisesPassed: number;
  exams: number;
}
export interface AdminUserProfile {
  username: string;
  joinedAt: string;
  lastActiveAt: string | null;
  tracks: { language: Language; total: number; passed: number; progress: number; runs: number; submits: number; submitsPassed: number; lastAt: string | null }[];
  exams: { language: Language; checkpoint: string; minutes: number; startedAt: string; endedAt: string | null; status: string; levels: number; levelsPassed: number; mark: number | null; maxMark: number | null }[];
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

export type Language = 'go' | 'js' | 'rust' | 'java';

export interface ExerciseSummary {
  slug: string;
  /** Rust: lib/bin. Go: func/prog. JS: absent. */
  kind?: string;
  argv?: boolean;
  passed?: boolean;
  /** Go/JS style progress; `passed` is derived from it when absent. */
  status?: string;
  title?: string | null;
  /** V2: private bookmark. */
  starred?: boolean;
}
export interface Placement {
  exercise: string;
  checkpoint: string;
  level: number;
  /** Percent of its checkpoint (D35); null when unweighted. */
  value?: number | null;
  category?: string;
}
/**
 * One exercise, in whichever shape the language's service returns.
 *
 * The unified shape is `files` + `editorFiles`. Rust's reference shape
 * (`libRs`/`mainRs`) is still read, so the web does not break while the
 * server is converging.
 */
export interface ExerciseDetail {
  slug: string;
  language?: Language;
  kind?: string;
  argv?: boolean;
  readme?: string;
  /** Go/JS name it `subject`. */
  subject?: string;
  placements: { checkpoint: string; level: number }[];
  files?: Record<string, string>;
  /** Tab order. Defaults to the keys of `files`. */
  editorFiles?: string[];
  /** Files the platform grades (lint runs on these only). */
  expectedFiles?: string[];
  libRs?: string | null;
  mainRs?: string;
  status?: string;
  /** Go lint inputs. */
  allowedFunctions?: string[];
  studentPackage?: string;
  /** JS lint input. */
  reservedNames?: string[];
}
export interface SnapshotMeta {
  id: number;
  kind: 'manual' | 'passing';
  createdAt: string;
}

/**
 * How the run ended, in one word (Rust vocabulary, used by RunNotice).
 * The runner may also send the Go/JS words; lib/diagnostics canonicalises them.
 */
export type RunOutcome =
  | 'ok'
  | 'timeout'
  | 'output_limit'
  | 'out_of_memory'
  | 'cancelled'
  /** Client-side only: the server refused the run (503), so nothing ever ran. */
  | 'runner_error';

/** POST /api/:lang/exercises/:slug/(run|test) answer: the run is queued, results stream. */
export interface StartedRun {
  runId: string;
  queuePosition?: number;
  /** Cool-down this kind will have once the run ends. */
  cooldownSeconds?: number;
}

/** WebSocket /ws/runs/:id messages. */
export type RunMessage =
  | { type: 'state'; state: 'queued' | 'starting' | 'running' | string; queuePosition?: number }
  | { type: 'output'; data?: string; text?: string; stream?: 'stdout' | 'stderr' }
  | {
      type: 'done';
      outcome?: string;
      exitCode?: number | null;
      passed?: boolean;
      durationMs?: number;
      timeoutSeconds?: number;
      argsTruncated?: boolean;
      maxArgs?: number;
      cooldownSeconds?: number;
    };

export interface RunnerState {
  activeRuns?: number;
  queueDepth?: number;
  maxConcurrent?: number;
  timeoutSeconds?: number;
  warnSeconds?: number;
  outputLimitBytes?: number;
  memoryMb?: number;
}

const enc = encodeURIComponent;
const ex = (lang: Language, slug: string) => `/api/${lang}/exercises/${enc(slug)}`;

/** The editor's files for a detail in either shape, in tab order. */
export function filesOf(d: ExerciseDetail): { order: string[]; files: Record<string, string> } {
  if (d.files && Object.keys(d.files).length > 0) {
    const files = { ...d.files };
    const listed = (d.editorFiles ?? []).filter((f) => f in files);
    const order = [...listed, ...Object.keys(files).filter((f) => !listed.includes(f))];
    return { order, files };
  }
  const files: Record<string, string> = {};
  if (d.kind !== 'bin' && d.libRs != null) files['lib.rs'] = d.libRs;
  files['main.rs'] = d.mainRs ?? '';
  return { order: Object.keys(files), files };
}

/** Rust's legacy save body travels alongside `files` so either server shape accepts it. */
function saveBody(files: Record<string, string>) {
  const lib = files['lib.rs'] ?? files['src/lib.rs'];
  const main = files['main.rs'] ?? files['src/main.rs'];
  return { files, ...(lib !== undefined ? { libRs: lib } : {}), ...(main !== undefined ? { mainRs: main } : {}) };
}

/** Account preferences (V2, D24). The server validates; this mirrors its shape. */
export interface Preferences {
  fontSize: number;
  tabSize: 2 | 4 | 8;
  wordWrap: boolean;
  keybindings: 'default' | 'vim';
}

/** One attempt as listed on the dashboard and in history (V2). */
export interface AttemptSummary {
  id: number;
  language: Language;
  slug: string;
  title: string;
  kind: 'run' | 'test';
  outcome: string | null;
  durationMs: number | null;
  at: string;
}

export interface AttemptDetail extends AttemptSummary {
  exitCode: number | null;
  files: Record<string, string>;
  output: string;
}

export interface TrackSummary {
  language: Language;
  total: number;
  passed: number;
  started: number;
  resume: { slug: string; title: string; at: string; passed: boolean } | null;
  gates: { checkpoint: string; total: number; passed: number }[];
  /** Weighted practice progress, percent (D35). */
  progress: number;
  /** Best finished exam mark, percent; null before the first. */
  bestExamMark: number | null;
  runs: number;
  submits: number;
  submitsPassed: number;
}

/** One exercise in history (D26): attempts are grouped, never listed flat. */
export interface ExerciseHistory {
  language: Language;
  slug: string;
  title: string;
  passed: boolean;
  runs: number;
  submits: number;
  passedOnSubmit: number | null;
  firstAt: string;
  lastAt: string;
  activeMs: number;
  lastKind: string;
  lastOutcome: string | null;
}

/** A passing copy in the solutions vault (V2). */
export interface VaultItem {
  language: Language;
  slug: string;
  title: string;
  passedAt: string;
  files: Record<string, string>;
}

/** A mock exam (V3): one exercise per level, separate from practice (D27). */
export interface ExamView {
  id: number;
  language: Language;
  checkpoint: string;
  minutes: number;
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
  status: 'active' | 'finished' | 'abandoned' | 'expired';
  passed: number;
  total: number;
  /** Percent of the checkpoint (D35); optional pushes it above 100. */
  mark: number;
  /** False when the checkpoint was removed from the program (D35a). */
  marked?: boolean;
  maxMark: number;
  items: { level: number; slug: string; title: string; value: number | null; submits: number; passed: boolean; passedAt: string | null }[];
}

/** Same-origin download link for the single-exercise Markdown report (D22). */
export function reportUrl(language: Language, slug: string): string {
  return `/api/${language}/exercises/${encodeURIComponent(slug)}/report`;
}

export interface HistoryFilter {
  language?: Language;
  slug?: string;
  kind?: 'run' | 'test';
  outcome?: string;
  before?: number;
  limit?: number;
}

export const api = {
  dashboard: () => request<{ tracks: TrackSummary[]; recent: AttemptSummary[] }>('/api/dashboard'),
  history: (f: HistoryFilter = {}) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '') q.set(k, String(v));
    return request<{ attempts: AttemptSummary[]; next: number | null }>(`/api/history?${q.toString()}`);
  },
  attempt: (id: number) => request<AttemptDetail>(`/api/history/${id}`),
  historyExercises: (language?: Language) =>
    request<{ exercises: ExerciseHistory[] }>(`/api/history/exercises${language ? `?language=${language}` : ''}`),
  timeline: (language: Language, slug: string) =>
    request<{ attempts: AttemptSummary[] }>(`/api/history/exercises/${language}/${encodeURIComponent(slug)}`),
  vault: () => request<{ items: VaultItem[] }>('/api/vault'),
  deleteSolution: (lang: Language, slug: string) => request<{ deleted: true }>(`/api/vault/${lang}/${enc(slug)}`, { method: 'DELETE' }),
  deleteExerciseHistory: (lang: Language, slug: string) => request<{ deleted: true }>(`/api/history/exercises/${lang}/${enc(slug)}`, { method: 'DELETE' }),
  deleteAttempt: (id: number) => request<{ deleted: true }>(`/api/history/${id}`, { method: 'DELETE' }),
  deleteExam: (id: number) => request<{ deleted: true }>(`/api/exams/${id}`, { method: 'DELETE' }),
  hint: (language: Language, slug: string) => request<{ hint: string | null }>(`/api/${language}/exercises/${encodeURIComponent(slug)}/hint`),
  exams: () => request<{ active: ExamView | null; past: ExamView[] }>('/api/exams'),
  exam: (id: number) => request<ExamView>(`/api/exams/${id}`),
  startExam: (language: Language, checkpoint: string, minutes: number) =>
    request<ExamView>('/api/exams', { method: 'POST', body: JSON.stringify({ language, checkpoint, minutes }) }),
  endExam: (id: number, abandon: boolean) => request<ExamView>(`/api/exams/${id}/end`, { method: 'POST', body: JSON.stringify({ abandon }) }),
  preferences: () => request<{ preferences: Preferences }>('/api/preferences'),
  savePreferences: (patch: Partial<Preferences>) =>
    request<{ preferences: Preferences }>('/api/preferences', {
      method: 'PUT',
      body: JSON.stringify(patch),
    }),
  me: () => request<{ identifier?: string; login?: string; isAdmin?: boolean }>('/api/auth/me'),
  adminUsers: () => request<{ users: AdminUserRow[] }>('/api/admin/users'),
  adminUser: (username: string) => request<AdminUserProfile>(`/api/admin/users/${encodeURIComponent(username)}`),
  adminOverview: (range: AdminRange) => request<AdminOverview>(`/api/admin/overview?range=${range}`),
  login: (identifier: string, password: string) =>
    request<{ identifier?: string; login?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password }),
    }),
  /** Whether the username-only dev sign-in is offered (never in production). */
  authConfig: () => request<{ devLogin: boolean }>('/api/auth/config'),
  devLogin: (username: string) =>
    request<{ identifier?: string; login?: string }>('/api/auth/dev-login', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),
  logout: () => request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
  exercises: (lang: Language) =>
    request<{ exercises: ExerciseSummary[]; placements: Placement[] }>(`/api/${lang}/exercises`),
  exercise: (lang: Language, slug: string) => request<ExerciseDetail>(ex(lang, slug)),
  save: (lang: Language, slug: string, files: Record<string, string>) =>
    request<{ slug: string }>(`/api/${lang}/progress/${enc(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(saveBody(files)),
    }),
  /** Discard saved code so the exercise serves its starter again. */
  reset: (lang: Language, slug: string) =>
    request<{ slug: string }>(`/api/${lang}/progress/${enc(slug)}`, { method: 'DELETE' }),
  snapshots: (lang: Language, slug: string) =>
    request<{ snapshots: SnapshotMeta[] }>(`/api/${lang}/snapshots/${enc(slug)}`),
  star: (lang: Language, slug: string, on: boolean) =>
    request<{ starred: boolean }>(`/api/${lang}/exercises/${enc(slug)}/star`, { method: on ? 'PUT' : 'DELETE' }),
  saveSnapshot: (lang: Language, slug: string, files: Record<string, string>) =>
    request<SnapshotMeta>(`/api/${lang}/snapshots/${enc(slug)}`, {
      method: 'POST',
      body: JSON.stringify(saveBody(files)),
    }),
  restoreSnapshot: (lang: Language, slug: string, id: number) =>
    request<{ kind: 'manual' | 'passing'; files?: Record<string, string>; libRs?: string | null; mainRs?: string }>(
      `/api/${lang}/snapshots/${enc(slug)}/restore`,
      { method: 'POST', body: JSON.stringify({ id }) },
    ),
  /** Queue a run; output arrives on /ws/runs/:runId. */
  start: (lang: Language, slug: string, mode: 'run' | 'test', files: Record<string, string>, args: string[]) =>
    request<StartedRun>(`${ex(lang, slug)}/${mode}`, {
      method: 'POST',
      body: JSON.stringify({ ...saveBody(files), args }),
    }),
  /** Go only: gofumpt the files server-side. */
  format: (lang: Language, slug: string, files: Record<string, string>) =>
    request<{ files: Record<string, string>; changed: string[] }>(`${ex(lang, slug)}/format`, {
      method: 'POST',
      body: JSON.stringify({ files }),
    }),
  /** Stop a run. Resolves false if it had already finished. */
  cancelRun: (runId: string) =>
    request<{ cancelled: boolean }>(`/api/runs/${enc(runId)}/cancel`, { method: 'POST' }),
  runnerState: () => request<RunnerState>('/api/runner'),
};

/** ws(s)://host/ws/runs/:id for the current origin. */
export function runSocketUrl(runId: string): string {
  const url = new URL(`/ws/runs/${encodeURIComponent(runId)}`, window.location.href);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return url.toString();
}
