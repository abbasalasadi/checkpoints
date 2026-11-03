// End-to-end API smoke test against a running server (dev mode, fake user).
//   node tools/smoke-api.mjs [baseUrl] [lang] [slug]
// Signs in, opens the exercise, runs the starter, cancels a run, formats (Go),
// and submits the reference solution; exits non-zero on any unexpected result.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const base = process.argv[2] ?? 'http://127.0.0.1:8157';
const lang = process.argv[3] ?? 'go';
const slug = process.argv[4] ?? 'printnbrbase';
let cookie = '';
let failures = 0;

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, json };
}

function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures++;
}

function waitDone(runId) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(base.replace(/^http/, 'ws') + `/ws/runs/${runId}`, { headers: { cookie } });
    let output = '';
    const timer = setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 120_000);
    ws.onmessage = (m) => {
      const ev = JSON.parse(m.data);
      if (ev.type === 'output') output += ev.text ?? ev.data ?? '';
      if (ev.type === 'done') { clearTimeout(timer); ws.close(); resolve({ ...ev, output }); }
    };
    ws.onerror = (e) => { clearTimeout(timer); reject(e.error ?? new Error('ws error')); };
  });
}

const user = `fake_smoke_${Date.now() % 100000}`;
const login = await call('POST', '/api/auth/dev-login', { username: user });
check('dev login', login.status === 200 && !!cookie, String(login.status));

const detail = await call('GET', `/api/${lang}/exercises/${slug}`);
check('exercise detail', detail.status === 200 && detail.json.files, String(detail.status));
const starter = detail.json.files ?? {};

const run = await call('POST', `/api/${lang}/exercises/${slug}/run`, { files: starter, args: ['42', '0123456789'] });
check('run accepted', run.status === 200 && run.json.runId, JSON.stringify(run.json).slice(0, 120));
if (run.json.runId) {
  const done = await waitDone(run.json.runId);
  check('run finished', !!done.outcome, done.outcome);
}

const again = await call('POST', `/api/${lang}/exercises/${slug}/run`, { files: starter });
check('run cooldown 429', again.status === 429 && again.json.secondsRemaining > 0, `${again.status} ${again.json.secondsRemaining}`);

if (lang === 'go') {
  const messy = Object.fromEntries(Object.entries(starter).map(([k, v]) => [k, v.replace(/\n/g, '\n\n\n')]));
  const fmt = await call('POST', `/api/go/exercises/${slug}/format`, { files: messy });
  check('go format', fmt.status === 200 && fmt.json.files, `${fmt.status} changed=${JSON.stringify(fmt.json.changed)}`);
}

// Submit the reference solution through the real route.
const dir = join(process.cwd(), 'content', lang, 'exercises', slug);
const solName = { go: 'solution.go', js: 'solution.js', rust: 'solution.rs' }[lang];
const solution = readFileSync(join(dir, solName), 'utf8');
const firstFile = (detail.json.editorFiles ?? Object.keys(starter))[0];
const sub = await call('POST', `/api/${lang}/exercises/${slug}/test`, { files: { ...starter, [firstFile]: solution } });
check('submit accepted', sub.status === 200 && sub.json.runId, JSON.stringify(sub.json).slice(0, 120));
if (sub.json.runId) {
  const done = await waitDone(sub.json.runId);
  check('submit passed', done.outcome === 'passed', done.outcome);
}

// Cancel: a second user so the cooldown does not interfere.
cookie = '';
await call('POST', '/api/auth/dev-login', { username: user + 'b' });
const long = await call('POST', `/api/${lang}/exercises/${slug}/test`, { files: starter });
if (long.json.runId) {
  const c = await call('POST', `/api/runs/${long.json.runId}/cancel`);
  const done = await waitDone(long.json.runId).catch((e) => ({ outcome: 'ws:' + e.message }));
  check('cancel', c.status === 200 || c.status === 204 || done.outcome === 'cancelled', `${c.status} ${done.outcome}`);
}

const attempts = await call('GET', `/api/${lang}/exercises/${slug}/attempts`);
check('attempts recorded', attempts.status === 200, String(attempts.status));

console.log(failures ? `smoke FAILED (${failures})` : 'smoke ok');
process.exit(failures ? 1 : 0);
