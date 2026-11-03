/**
 * Thin adapter between the HTTP/WebSocket layer and the run dispatcher in
 * ./runner/ (written separately, docs/v1-contracts.md).
 *
 * The dispatcher is loaded lazily through a non-literal specifier so the
 * server compiles and its tests run whether or not ./runner/index.ts exists
 * yet. Every optional export is probed, never assumed.
 *
 * Contract relied on:
 *   submitRun({user, language, slug, files, args, mode, exercise?}) -> id | Promise<id>
 *   getRun(id) | get(id) -> RunRecord   (user, state, output, outcome, events: emits 'event' RunEvent)
 *   CooldownError / QueueFullError / BusyError carry .name (and .secondsRemaining)
 * Optional: cancelRun(id, user), runnerLimits, cooldownRemaining(user, mode),
 *   submitFormat({user, language, files}), preflightRunners(), startRunners(),
 *   stopRunners().
 */

import type { EventEmitter } from 'node:events';
import type { Language } from '../languages.js';
import { logger } from '../logger.js';

export type RunMode = 'run' | 'test';

export interface RunEventLike {
  type: 'state' | 'output' | 'done';
  [k: string]: unknown;
}

export interface RunLike {
  id: string;
  user: string;
  language?: Language;
  slug?: string;
  state: string;
  queuePosition?: number;
  output?: string;
  outcome?: string | null;
  exitCode?: number | null;
  durationMs?: number | null;
  truncated?: boolean;
  events: EventEmitter;
}

export interface SubmitInput {
  user: number | string;
  language: Language;
  slug: string;
  files: Record<string, string>;
  args?: string[];
  mode: RunMode;
  exercise?: { expectedFiles?: string[]; editorFiles?: string[]; allowedFunctions?: string[] };
}

type RunnerModule = {
  submitRun: (input: SubmitInput) => string | { id: string } | Promise<string | { id: string }>;
  getRun?: (id: string) => RunLike | undefined;
  get?: (id: string) => RunLike | undefined;
  cancelRun?: (id: string, user: string) => boolean | Promise<boolean>;
  runnerLimits?: Record<string, unknown>;
  cooldownRemaining?: (user: string, mode: RunMode) => number;
  submitFormat?: (input: { user: string | number; language: Language; files: Record<string, string> }) => Promise<unknown>;
  preflightRunners?: (languages?: Language[]) => Promise<void>;
  startRunners?: () => void;
  stopRunners?: () => Promise<void>;
};

export class RunnerUnavailableError extends Error {
  constructor(reason: string) {
    super(`runner unavailable: ${reason}`);
    this.name = 'RunnerUnavailableError';
  }
}

let loaded: Promise<RunnerModule | null> | null = null;
let override: RunnerModule | null = null;

/** Tests inject a fake dispatcher here. */
export function setRunnerModule(mod: RunnerModule | null): void {
  override = mod;
}

export function loadRunner(): Promise<RunnerModule | null> {
  if (override) return Promise.resolve(override);
  if (!loaded) {
    const spec = './runner/index.js';
    loaded = import(spec)
      .then((m: unknown) => {
        const mod = m as RunnerModule;
        if (typeof mod.submitRun !== 'function') throw new Error('runner/index.js does not export submitRun');
        return mod;
      })
      .catch((err: unknown) => {
        logger.error('runs.module_unavailable', { error: String(err) });
        loaded = null; // retry on the next request — the module may land later
        return null;
      });
  }
  return loaded;
}

async function need(): Promise<RunnerModule> {
  const mod = await loadRunner();
  if (!mod) throw new RunnerUnavailableError('module not loaded');
  return mod;
}

export async function submit(input: SubmitInput): Promise<string> {
  const mod = await need();
  const r = await mod.submitRun(input);
  return typeof r === 'string' ? r : r.id;
}

export async function getRun(id: string): Promise<RunLike | undefined> {
  const mod = await loadRunner();
  if (!mod) return undefined;
  return (mod.getRun ?? mod.get)?.(id);
}

export async function cancel(id: string, user: string): Promise<boolean> {
  const mod = await loadRunner();
  if (!mod?.cancelRun) return false;
  return mod.cancelRun(id, user);
}

export async function limits(): Promise<Record<string, unknown> | null> {
  const mod = await loadRunner();
  return mod?.runnerLimits ? { ...mod.runnerLimits } : null;
}

export async function cooldownRemaining(user: string, mode: RunMode): Promise<number | null> {
  const mod = await loadRunner();
  return mod?.cooldownRemaining?.(user, mode) ?? null;
}

export async function format(user: number | string, language: Language, files: Record<string, string>): Promise<unknown> {
  const mod = await need();
  if (!mod.submitFormat) throw new RunnerUnavailableError('format not supported');
  return mod.submitFormat({ user, language, files });
}

export async function lifecycle(): Promise<RunnerModule | null> {
  return loadRunner();
}
