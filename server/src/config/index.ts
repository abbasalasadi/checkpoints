/**
 * Configuration. Defaults are declared first, then overridden by the
 * environment — the loading order is explicit and predictable.
 *
 * Two classes of value, per docs/01-canonical.md:
 *   - Required secrets: no default, fail fast at startup. Never a hardcoded
 *     fallback, because a fallback secret is worse than no secret.
 *   - Operational settings: safe defaults, never fail fast.
 */

import { fromRoot, REPO_ROOT } from './paths.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

/** Operational defaults. Every one of these is safe to run with. */
const defaults = {
  appName: 'rust-checkpoints',
  appEnv: 'development',
  apiPort: 8128,
  webPort: 5190,
  dbPath: 'var/db/app.db',
  logEnabled: true,
  logLevel: 'info' as LogLevel,
  logDir: 'var/logs',
  sessionTtlHours: 12,
  platformSigninUrl: 'https://learn.reboot01.com/api/auth/signin',
  runnerImage: 'rust-checkpoints-runner:latest',
  runnerMaxConcurrent: 3,
  // Run and Test throttle independently. Test is the graded action and waits
  // longer; Run is the cheap "does it execute" loop and stays short so checking
  // work is not punished.
  runnerCooldownRunSeconds: 30,
  runnerCooldownTestSeconds: 90,
  runnerIdleSeconds: 60,
  // A container with an open terminal is held far longer: the student is
  // present. 60s killed live sessions while they were reading output.
  runnerTerminalIdleSeconds: 1800,
  // 384, not 256: measured. brackets_matching_test pulls rand -> zerocopy,
  // which OOMs at 256 MB even single-threaded. Every other exercise needs ~125 MB.
  runnerMemoryMb: 384,
  runnerCpus: 0.5,
  // 60s, not 120: a cold `cargo test` on the heaviest exercise measures 23s on
  // the VM at the real cgroup limits, so this leaves ~2.5x margin over the worst
  // legitimate run while halving how long a stuck one wastes a slot.
  runnerTimeoutSeconds: 60,
  runnerWarnSeconds: 20,
};

function str(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(v.trim().toLowerCase());
}

function level(name: string, fallback: LogLevel): LogLevel {
  const v = (process.env[name] ?? '').trim().toLowerCase() as LogLevel;
  return LOG_LEVELS.includes(v) ? v : fallback;
}

/**
 * Required secrets have no default. Missing one aborts startup with a message
 * that says what to do, not just what went wrong.
 */
function requiredSecret(name: string, howToFix: string): string {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') {
    // eslint-disable-next-line no-console -- config failure predates the logger
    console.error(
      `\n[FATAL] Required secret ${name} is not set.\n` +
        `        ${howToFix}\n` +
        `        Startup aborted deliberately: a hardcoded fallback secret is worse than none.\n`,
    );
    process.exit(1);
  }
  return v.trim();
}

export const config = {
  repoRoot: REPO_ROOT,
  appName: str('APP_NAME', defaults.appName),
  appEnv: str('APP_ENV', defaults.appEnv),

  apiPort: int('API_PORT', defaults.apiPort),
  webPort: int('WEB_PORT', defaults.webPort),

  /** Absolute — resolved against the repo root, not cwd. */
  dbPath: fromRoot(str('DB_PATH', defaults.dbPath)),

  logEnabled: bool('LOG_ENABLED', defaults.logEnabled),
  logLevel: level('LOG_LEVEL', defaults.logLevel),
  logDir: str('LOG_DIR', defaults.logDir),

  sessionTtlHours: int('SESSION_TTL_HOURS', defaults.sessionTtlHours),
  platformSigninUrl: str('PLATFORM_SIGNIN_URL', defaults.platformSigninUrl),

  runner: {
    image: str('RUNNER_IMAGE', defaults.runnerImage),
    maxConcurrent: int('RUNNER_MAX_CONCURRENT', defaults.runnerMaxConcurrent),
    cooldownRunSeconds: int('RUNNER_COOLDOWN_RUN_SECONDS', defaults.runnerCooldownRunSeconds),
    cooldownTestSeconds: int('RUNNER_COOLDOWN_TEST_SECONDS', defaults.runnerCooldownTestSeconds),
    idleSeconds: int('RUNNER_IDLE_SECONDS', defaults.runnerIdleSeconds),
    terminalIdleSeconds: int('RUNNER_TERMINAL_IDLE_SECONDS', defaults.runnerTerminalIdleSeconds),
    memoryMb: int('RUNNER_MEMORY_MB', defaults.runnerMemoryMb),
    cpus: num('RUNNER_CPUS', defaults.runnerCpus),
    timeoutSeconds: int('RUNNER_TIMEOUT_SECONDS', defaults.runnerTimeoutSeconds),
    // When to tell a student their run looks stuck — long before we stop it, so
    // they can cancel and fix the loop rather than sit and wait it out.
    warnSeconds: int('RUNNER_WARN_SECONDS', defaults.runnerWarnSeconds),
  },
};

/**
 * Called explicitly at startup rather than at import time, so tests can import
 * the config module without being killed by a missing secret.
 */
export function loadSecrets() {
  return {
    sessionSigningKey: requiredSecret(
      'SESSION_SIGNING_KEY',
      'Set it in .env — generate one with: openssl rand -hex 32',
    ),
  };
}
