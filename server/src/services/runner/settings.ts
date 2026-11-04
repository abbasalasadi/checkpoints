/**
 * Runner settings. Shared limits come from `config.runner` (Rust reference keys,
 * D16); the per-language extras are read here so this module does not need the
 * config file (owned by another workstream) to change.
 *
 * Environment (all optional):
 *   RUNNER_BACKEND             docker | cloudrun   transport for go, js and java (rust is always docker)
 *   RUNNER_GO_IMAGE            default go-checkpoints-runner:dev
 *   RUNNER_JS_IMAGE            default js-checkpoints-runner:dev
 *   RUNNER_IMAGE               rust image (config.runner.image)
 *   RUNNER_GO_CLOUDRUN_URL     Cloud Run service for go   (RUNNER_BACKEND=cloudrun)
 *   RUNNER_JS_CLOUDRUN_URL     Cloud Run service for js
 *   RUNNER_JAVA_IMAGE          default java-checkpoints-runner:dev
 *   RUNNER_JAVA_CLOUDRUN_URL   Cloud Run service for java
 *   RUNNER_JAVA_MEMORY_MB      memory floor for java containers (JVM + Maven), default 768
 *   RUNNER_JAVA_TMPFS_MB       /tmp size inside java containers (Maven project + classes), default 256
 *   RUNNER_RUNS_DIR            host dir for per-run bind mounts, default var/runs
 *   RUNNER_TMPFS_MB            /tmp size inside go/js containers, default 64
 *   RUNNER_QUEUE_MAX           queued jobs before refusing, default 40
 *   RUNNER_OUTPUT_LIMIT_KB     output cap, default 1024 (D16: 1 MB)
 */

import { config } from '../../config/index.js';
import { fromRoot } from '../../config/paths.js';
import type { Limits } from './types.js';

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v.trim() === '' ? fallback : v.trim();
}

function int(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type Transport = 'docker' | 'cloudrun';

const backend = str('RUNNER_BACKEND', 'docker');

export const runnerSettings = {
  transport: (backend === 'cloudrun' ? 'cloudrun' : 'docker') as Transport,
  memoryMb: config.runner.memoryMb,
  cpus: config.runner.cpus,
  tmpfsMb: int('RUNNER_TMPFS_MB', 64),
  runsDir: fromRoot(str('RUNNER_RUNS_DIR', 'var/runs')),
  rust: { image: config.runner.image },
  go: { image: str('RUNNER_GO_IMAGE', 'go-checkpoints-runner:dev'), cloudRunUrl: str('RUNNER_GO_CLOUDRUN_URL', '') },
  js: { image: str('RUNNER_JS_IMAGE', 'js-checkpoints-runner:dev'), cloudRunUrl: str('RUNNER_JS_CLOUDRUN_URL', '') },
  java: {
    image: str('RUNNER_JAVA_IMAGE', 'java-checkpoints-runner:dev'),
    cloudRunUrl: str('RUNNER_JAVA_CLOUDRUN_URL', ''),
    memoryMb: int('RUNNER_JAVA_MEMORY_MB', 768),
    tmpfsMb: int('RUNNER_JAVA_TMPFS_MB', 256),
  },
};

export const runnerLimits: Limits = {
  maxConcurrent: config.runner.maxConcurrent,
  cooldownRunSeconds: config.runner.cooldownRunSeconds,
  cooldownTestSeconds: config.runner.cooldownTestSeconds,
  timeoutSeconds: config.runner.timeoutSeconds,
  outputLimitBytes: int('RUNNER_OUTPUT_LIMIT_KB', 1024) * 1024,
  queueMax: int('RUNNER_QUEUE_MAX', 40),
  retainDoneMs: 60_000,
};
