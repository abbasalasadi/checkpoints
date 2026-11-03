/**
 * One ephemeral container per job — the Go and JS references' Docker transport.
 * Student files are written to a host dir and bind-mounted read-only; output is
 * streamed through the shared demuxer; the container is always removed.
 */

import Docker from 'dockerode';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pumpStream, safeRelativePath } from './docker-stream.js';
import type { BackendResult, JobContext } from './types.js';

export const docker = new Docker();

export interface EphemeralSpec {
  image: string;
  env: string[];
  cmd?: string[];
  entrypoint?: string[];
  /** Host dir holding the files (created and removed here) and where it is mounted. */
  runDir: string;
  mountAt: string;
  files: Record<string, string>;
  memoryMb: number;
  cpus: number;
  tmpfs: string;
  pidsLimit: number;
  readonlyRootfs: boolean;
  noNewPrivileges: boolean;
}

/** Image-level probe: no-new-privileges breaks every exec on some hosts. */
export async function probeNoNewPrivileges(image: string): Promise<boolean> {
  let c: Docker.Container | undefined;
  try {
    c = await docker.createContainer({
      Image: image,
      Entrypoint: ['/bin/true'],
      HostConfig: { NetworkMode: 'none', SecurityOpt: ['no-new-privileges'], CapDrop: ['ALL'] },
    });
    await c.start();
    const r = (await c.wait()) as { StatusCode?: number } | { StatusCode?: number }[];
    const status = Array.isArray(r) ? r[0]?.StatusCode : r.StatusCode;
    return status === 0;
  } catch {
    return false;
  } finally {
    await c?.remove({ force: true }).catch(() => {});
  }
}

export async function requireImage(image: string): Promise<void> {
  await docker.ping();
  try {
    await docker.getImage(image).inspect();
  } catch {
    throw new Error(`runner image not found: ${image}`);
  }
}

export function writeRunFiles(dir: string, files: Record<string, string>): void {
  mkdirSync(dir, { recursive: true });
  for (const [rel, body] of Object.entries(files)) {
    if (!safeRelativePath(rel)) throw new Error(`illegal path: ${rel}`);
    const target = join(dir, rel);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
}

export async function runEphemeral(spec: EphemeralSpec, ctx: JobContext): Promise<BackendResult> {
  let container: Docker.Container | undefined;
  const kill = () => void container?.kill().catch(() => {});
  try {
    writeRunFiles(spec.runDir, spec.files);
    container = await docker.createContainer({
      Image: spec.image,
      Env: spec.env,
      // argv, never a shell string: run-mode args go straight to the entrypoint's "$@".
      ...(spec.cmd ? { Cmd: spec.cmd } : {}),
      ...(spec.entrypoint ? { Entrypoint: spec.entrypoint } : {}),
      Tty: false,
      HostConfig: {
        AutoRemove: false,
        NetworkMode: 'none',
        ReadonlyRootfs: spec.readonlyRootfs,
        Binds: [`${spec.runDir}:${spec.mountAt}:ro`],
        Tmpfs: { '/tmp': spec.tmpfs },
        Memory: spec.memoryMb * 1024 * 1024,
        MemorySwap: spec.memoryMb * 1024 * 1024,
        PidsLimit: spec.pidsLimit,
        NanoCpus: Math.round(spec.cpus * 1e9),
        CapDrop: ['ALL'],
        ...(spec.noNewPrivileges ? { SecurityOpt: ['no-new-privileges'] } : {}),
      },
    });

    if (ctx.signal.aborted) return { exitCode: null };
    ctx.signal.addEventListener('abort', kill, { once: true });

    // Attach before start so the first bytes are not lost.
    const stream = await container.attach({ stream: true, stdout: true, stderr: true });
    const pumped = pumpStream(stream, (text) => void ctx.output(text), ctx.signal);
    await container.start();

    const r = (await container.wait()) as { StatusCode?: number } | { StatusCode?: number }[];
    const exitCode = Number((Array.isArray(r) ? r[0]?.StatusCode : r.StatusCode) ?? -1);
    // Let the tail of the stream drain (bounded), so the last lines are not lost.
    await Promise.race([pumped, new Promise((res) => setTimeout(res, 1000))]);

    // OOM is read for any non-zero exit: `go run` survives its child's SIGKILL and exits 1.
    let oomKilled = false;
    if (exitCode !== 0) {
      oomKilled = !!(await container.inspect().catch(() => null))?.State?.OOMKilled;
    }
    return { exitCode, oomKilled };
  } finally {
    ctx.signal.removeEventListener('abort', kill);
    await container?.remove({ force: true }).catch(() => {});
    rmSync(spec.runDir, { recursive: true, force: true });
  }
}
