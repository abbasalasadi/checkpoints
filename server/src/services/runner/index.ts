/**
 * The runner module (V1 contract): one global dispatcher in front of the
 * rust / go / js backends.
 *
 *   const id = submitRun({ user, language, slug, files, args, mode: 'run' | 'test', exercise })
 *   const off = subscribeRun(id, (event) => ws.send(JSON.stringify(event)))   // /ws/runs/:id
 *   runEvents.on('done', (run) => persist(run))                              // attempts table
 *
 * `runner` is the legacy Rust facade the reference routes and terminal use.
 */

import { config } from '../../config/index.js';
import { logger } from '../../logger.js';
import { runnerUsage } from '../../repositories/index.js';
import { Dispatcher } from './dispatcher.js';
import { GoBackend } from './go.js';
import { JsBackend } from './js.js';
import { LegacyRustRunner } from './legacy.js';
import { RustBackend } from './rust.js';
import { runnerLimits, runnerSettings } from './settings.js';
import type { Language, RunEvent, RunMode, RunRecord, SubmitRunInput } from './types.js';

export * from './types.js';
export { Dispatcher, type FormatResult } from './dispatcher.js';
export { DockerDemuxer } from './docker-stream.js';
export { RunTimeoutError, type ExecResult, type RunKind } from './legacy.js';
export { runnerLimits, runnerSettings } from './settings.js';

export const rustBackend = new RustBackend(
  {
    image: runnerSettings.rust.image,
    memoryMb: runnerSettings.memoryMb,
    cpus: runnerSettings.cpus,
    maxConcurrent: runnerLimits.maxConcurrent,
    idleSeconds: config.runner.idleSeconds,
    terminalIdleSeconds: config.runner.terminalIdleSeconds,
  },
  logger,
  runnerUsage,
);

export const dispatcher = new Dispatcher(
  runnerLimits,
  [rustBackend, new GoBackend(runnerSettings, logger), new JsBackend(runnerSettings, logger)],
  logger,
);

/** Emits 'done' with the finished RunRecord (every language and kind, format included). */
export const runEvents = dispatcher;

export const submitRun = (input: SubmitRunInput): string => dispatcher.submitRun(input);
export const submitFormat = (input: { user: string | number; language: Language; files: Record<string, string> }) =>
  dispatcher.submitFormat(input);
export const getRun = (id: string): RunRecord | undefined => dispatcher.get(id);
export const waitForRun = (id: string): Promise<RunRecord> => dispatcher.waitFor(id);
export const subscribeRun = (id: string, listener: (e: RunEvent) => void) => dispatcher.subscribe(id, listener);
export const cancelRun = (id: string, user: string | number): boolean => dispatcher.cancel(id, user);
export const cooldownRemaining = (user: string | number, mode: RunMode): number =>
  dispatcher.cooldownRemaining(user, mode);

/** Check every backend; throws naming each one that is not usable. */
export async function preflightRunners(languages: Language[] = ['rust', 'go', 'js']): Promise<void> {
  const failures: string[] = [];
  for (const lang of languages) {
    try {
      await dispatcher.backend(lang)?.preflight?.();
    } catch (err) {
      failures.push(`${lang}: ${String(err instanceof Error ? err.message : err)}`);
    }
  }
  if (failures.length) throw new Error(failures.join('; '));
}

export function startRunners(): void {
  rustBackend.start();
}

export function stopRunners(): Promise<void> {
  return dispatcher.stop();
}

/** Legacy facade (reference routes, terminal, main.ts). */
export const runner = new LegacyRustRunner(dispatcher, rustBackend, preflightRunners);
export { LegacyRustRunner as Runner };
