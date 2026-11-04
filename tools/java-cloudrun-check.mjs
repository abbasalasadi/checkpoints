// Cloud Run wrapper gate for Java (V3 step 7f): sends every exercise to a
// running wrapper container over HTTP, in the body server/src/services/runner/
// java.ts sends, one instance, one request at a time (as --concurrency=1):
//   submit solution must pass, then submit starter on the same warm instance
//   must fail (nothing carries over), and run must print.
//   node tools/java-cloudrun-check.mjs [http://127.0.0.1:8080]
import fs from 'node:fs';
import path from 'node:path';

const url = process.argv[2] ?? 'http://127.0.0.1:8080';
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const base = path.join(root, 'content/java/exercises');
const read = (dir, names) => Object.fromEntries(names.map((n) => [n, fs.readFileSync(path.join(dir, n), 'utf8')]));

async function post(body) {
  const res = await fetch(`${url}/run`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res.ok) return { exitCode: `HTTP ${res.status}`, output: await res.text() };
  let output = '';
  let exitCode = null;
  for (const line of (await res.text()).split('\n')) {
    if (!line.trim()) continue;
    const f = JSON.parse(line);
    if (f.type === 'output') output += f.text;
    if (f.type === 'done') exitCode = f.exitCode;
  }
  return { exitCode, output };
}

let bad = 0;
const times = [];
for (const slug of fs.readdirSync(base).sort()) {
  const dir = path.join(base, slug);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const runner = read(dir, ['ExerciseRunner.java']);
  const solution = { ...read(path.join(dir, 'solution'), meta.expectedFiles), ...runner };
  const starter = { ...read(dir, meta.expectedFiles), ...runner };
  const cases = [
    ['solution', 'submit', solution, (r) => r.exitCode === 0],
    ['starter', 'submit', starter, (r) => r.exitCode !== 0 && r.exitCode !== null && typeof r.exitCode === 'number'],
    ['run', 'run', solution, (r) => r.exitCode === 0 && r.output.trim().length > 0],
  ];
  for (const [kind, mode, files, ok] of cases) {
    const t0 = Date.now();
    const r = await post({ exercise: meta.test.className, mode, files, args: [], expectedFiles: meta.expectedFiles, editorFiles: meta.editorFiles });
    const ms = Date.now() - t0;
    if (kind === 'solution') times.push(ms);
    if (ok(r)) console.log(`ok   ${slug} ${kind} rc=${r.exitCode} ${ms}ms`);
    else {
      bad++;
      console.log(`BAD  ${slug} ${kind} rc=${r.exitCode} ${ms}ms\n${r.output.split('\n').slice(-12).map((l) => '     ' + l).join('\n')}`);
    }
  }
}
// Path escape and junk must be refused, not run.
const evil = await post({ exercise: 'Factorial', mode: 'submit', files: { '../x.java': 'class x{}' } });
if (evil.exitCode === 'HTTP 400') console.log('ok   refuses ../ file names');
else { bad++; console.log('BAD  accepted ../ file name'); }
times.sort((a, b) => a - b);
console.log(`submit(solution) ms: min ${times[0]} median ${times[Math.floor(times.length / 2)]} max ${times.at(-1)}`);
console.log(`bad ${bad}`);
process.exit(bad ? 1 : 0);
