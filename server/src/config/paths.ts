/**
 * Repository-root resolution.
 *
 * npm workspaces run each package with cwd set to the *workspace* directory,
 * so resolving "var/logs" against process.cwd() silently writes to
 * server/var/logs instead of the repo's var/logs. Every relative path in the
 * config is therefore resolved against the repo root, found by walking up from
 * this module until the workspaces root package.json appears.
 *
 * Walking from import.meta.url rather than cwd means this works identically
 * when run from src/ via tsx and from dist/ after a build.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (let i = 0; i < 10; i += 1) {
    const candidate = join(dir, 'package.json');
    if (existsSync(candidate)) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, 'utf8')) as { workspaces?: unknown };
        if (pkg.workspaces) return dir;
      } catch {
        // Unreadable package.json: keep walking rather than guessing.
      }
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  // Falling back to cwd keeps the process alive; the caller logs the resolved
  // path at startup so a wrong root is visible rather than silent.
  return process.cwd();
}

export const REPO_ROOT = findRepoRoot(dirname(fileURLToPath(import.meta.url)));

/** Resolve a config path against the repo root, leaving absolute paths alone. */
export function fromRoot(p: string): string {
  return isAbsolute(p) ? p : resolve(REPO_ROOT, p);
}
