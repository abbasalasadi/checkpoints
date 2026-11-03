/**
 * Cloud Run transport, ported from the Go and JS references (identical contract):
 * POST <url>/run with a JSON body, response is NDJSON frames
 *   {"type":"output","text":...}  {"type":"done","exitCode":n,"oomKilled":bool}
 * Auth is a GCE metadata-server ID token (no key file on disk). Transient 5xx
 * during scale-out is retried, but only before any output reached the student.
 *
 * Off by default: selected per language only when RUNNER_BACKEND=cloudrun.
 */

import type { BackendResult, JobContext, RunnerLog } from './types.js';

const tokens = new Map<string, { value: string; expires: number }>();

async function idToken(audience: string): Promise<string> {
  const cached = tokens.get(audience);
  if (cached && Date.now() < cached.expires) return cached.value;
  const res = await fetch(
    'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity' +
      `?audience=${encodeURIComponent(audience)}`,
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!res.ok) throw new Error(`metadata server: HTTP ${res.status}`);
  const value = (await res.text()).trim();
  tokens.set(audience, { value, expires: Date.now() + 45 * 60_000 });
  return value;
}

export async function runOnCloudRun(
  url: string,
  body: unknown,
  ctx: JobContext,
  log: RunnerLog,
): Promise<BackendResult> {
  if (!url) throw new Error('RUNNER_BACKEND=cloudrun but no Cloud Run URL is configured for this language');
  const payload = JSON.stringify(body);

  for (let attempt = 1; ; attempt++) {
    // One controller per attempt, chained to the job's signal.
    const ctrl = new AbortController();
    const onAbort = () => ctrl.abort(ctx.signal.reason);
    if (ctx.signal.aborted) onAbort();
    else ctx.signal.addEventListener('abort', onAbort, { once: true });
    let streamed = false;

    try {
      const res = await fetch(`${url}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken(url)}` },
        body: payload,
        signal: ctrl.signal,
      });
      if (res.status >= 500 && attempt < 3) throw new Error(`retryable HTTP ${res.status}`);
      if (!res.ok || !res.body) throw new Error(`cloud run refused: HTTP ${res.status}`);

      let exitCode: number | null = null;
      let oomKilled = false;
      let buf = '';
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        for (let nl = buf.indexOf('\n'); nl >= 0; nl = buf.indexOf('\n')) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const frame = JSON.parse(line) as
            | { type: 'output'; text: string }
            | { type: 'done'; exitCode: number; oomKilled?: boolean };
          if (frame.type === 'output') {
            streamed = true;
            if (!ctx.output(frame.text)) ctrl.abort(ctx.signal.reason);
          } else if (frame.type === 'done') {
            exitCode = frame.exitCode;
            oomKilled = !!frame.oomKilled;
          }
        }
      }
      return { exitCode, oomKilled };
    } catch (err) {
      // A deliberate abort is a verdict (the dispatcher knows which), never retried.
      if (ctx.signal.aborted) return { exitCode: null };
      if (streamed || attempt >= 3) throw err;
      log.warn('runner.cloudrun.retry', { attempt, error: String(err) });
      await new Promise((r) => setTimeout(r, 300 * attempt));
    } finally {
      ctx.signal.removeEventListener('abort', onAbort);
    }
  }
}
