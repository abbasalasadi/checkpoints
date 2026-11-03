/**
 * Dispatcher tests with a fake backend: queue/concurrency, cooldowns from run
 * end, cancel (queued and running), timeout, output cap, event stream, format,
 * plus the Docker stream demuxer. No Docker, config or DB involved.
 */

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { Dispatcher } from '../../src/services/runner/dispatcher.js';
import { DockerDemuxer } from '../../src/services/runner/docker-stream.js';
import {
  BusyError,
  CooldownError,
  QueueFullError,
  type Backend,
  type BackendResult,
  type Job,
  type JobContext,
  type Language,
  type Limits,
  type RunEvent,
} from '../../src/services/runner/types.js';

const limits = (over: Partial<Limits> = {}): Limits => ({
  maxConcurrent: 3,
  cooldownRunSeconds: 30,
  cooldownTestSeconds: 90,
  timeoutSeconds: 60,
  outputLimitBytes: 1024 * 1024,
  queueMax: 40,
  retainDoneMs: 60_000,
  ...over,
});

/** A backend whose jobs finish only when the test says so (or on abort). */
class FakeBackend implements Backend {
  readonly started: Job[] = [];
  readonly gates = new Map<string, (r: BackendResult) => void>();
  ignoreAbort = false;
  constructor(
    readonly language: Language,
    readonly exclusivePerUser = false,
  ) {}
  run(job: Job, ctx: JobContext): Promise<BackendResult> {
    this.started.push(job);
    return new Promise((resolve) => {
      this.gates.set(job.id, resolve);
      if (!this.ignoreAbort) ctx.signal.addEventListener('abort', () => resolve({ exitCode: null }), { once: true });
      (job as Job & { ctx?: JobContext }).ctx = ctx;
    });
  }
  finish(id: string, r: BackendResult = { exitCode: 0 }) {
    this.gates.get(id)?.(r);
  }
  ctx(id: string): JobContext {
    return (this.started.find((j) => j.id === id) as Job & { ctx: JobContext }).ctx;
  }
}

const made: Dispatcher[] = [];
afterEach(async () => {
  await Promise.all(made.splice(0).map((d) => d.stop()));
});
const track = (d: Dispatcher) => (made.push(d), d);

const tick = () => new Promise((r) => setImmediate(r));
const input = (user: string | number, mode: 'run' | 'test' = 'run', language: Language = 'go') => ({
  user,
  language,
  slug: 'hello',
  files: { 'main.go': 'package main' },
  mode,
});

test('global concurrency: at most maxConcurrent run, the rest queue in order', async () => {
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits(), [fake]));
  const ids = ['a', 'b', 'c', 'd', 'e'].map((u) => d.submitRun(input(u)));
  await tick();
  assert.equal(d.activeRuns, 3);
  assert.equal(d.queueDepth, 2);
  assert.equal(d.get(ids[3]!)!.queuePosition, 1);
  assert.equal(d.get(ids[4]!)!.queuePosition, 2);

  fake.finish(ids[0]!);
  await tick();
  await tick();
  assert.equal(d.activeRuns, 3);
  assert.equal(d.get(ids[3]!)!.state, 'running');
  assert.equal(d.get(ids[4]!)!.queuePosition, 1);
  assert.deepEqual(fake.started.map((j) => j.user), ['a', 'b', 'c', 'd']);
});

test('cooldown counts from run end, per user per mode', async () => {
  let now = 1_000_000;
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits(), [fake], undefined, () => now));
  const id = d.submitRun(input(1, 'run'));
  // While in flight the whole window is still ahead.
  assert.equal(d.cooldownRemaining(1, 'run'), 30);
  assert.throws(() => d.submitRun(input(1, 'run')), CooldownError);
  // Other mode and other users are independent.
  assert.equal(d.cooldownRemaining(1, 'test'), 0);
  assert.equal(d.cooldownRemaining(2, 'run'), 0);

  await tick();
  now += 50_000; // a long run: the window must not have elapsed during it
  fake.finish(id);
  await d.waitFor(id);
  assert.equal(d.cooldownRemaining(1, 'run'), 30);
  now += 29_500;
  assert.equal(d.cooldownRemaining(1, 'run'), 1);
  now += 500;
  assert.equal(d.cooldownRemaining(1, 'run'), 0);
  assert.doesNotThrow(() => d.submitRun(input(1, 'run')));

  // Submit (test) is 90 s.
  const t = d.submitRun(input(1, 'test'));
  await tick();
  fake.finish(t, { exitCode: 1 });
  await d.waitFor(t);
  assert.equal(d.cooldownRemaining(1, 'test'), 90);
});

test('cancel a queued run: removed from the queue, done=cancelled, positions reindexed', async () => {
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits({ maxConcurrent: 1 }), [fake]));
  const a = d.submitRun(input('a'));
  const b = d.submitRun(input('b'));
  const c = d.submitRun(input('c'));
  await tick();
  assert.equal(d.cancel(b, 'someone-else'), false, 'only the owner may cancel');
  assert.equal(d.cancel(b, 'b'), true);
  const run = await d.waitFor(b);
  assert.equal(run.outcome, 'cancelled');
  assert.equal(d.get(c)!.queuePosition, 1);
  assert.equal(d.cancel(b, 'b'), false, 'already done');
  fake.finish(a);
  await tick();
  await tick();
  assert.deepEqual(fake.started.map((j) => j.user), ['a', 'c']);
});

test('cancel a running run: signal aborted, outcome cancelled, slot freed, cooldown starts', async () => {
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits({ maxConcurrent: 1 }), [fake]));
  const a = d.submitRun(input('a'));
  const b = d.submitRun(input('b'));
  await tick();
  assert.equal(d.cancel(a, 'a'), true);
  const run = await d.waitFor(a);
  assert.equal(run.outcome, 'cancelled');
  assert.equal(fake.ctx(a).signal.reason, 'cancelled');
  await tick();
  assert.equal(d.get(b)!.state, 'running');
  assert.equal(d.cooldownRemaining('a', 'run'), 30);
});

test('timeout aborts the job and reports timeout', async () => {
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits({ timeoutSeconds: 0.05 }), [fake]));
  const id = d.submitRun(input('a'));
  const run = await d.waitFor(id);
  assert.equal(run.outcome, 'timeout');
  assert.equal(run.exitCode, null);
});

test('abort reason wins over a backend that still reports an exit code', async () => {
  const fake = new FakeBackend('go');
  fake.ignoreAbort = true;
  const d = track(new Dispatcher(limits(), [fake]));
  const id = d.submitRun(input('a'));
  await tick();
  d.cancel(id, 'a');
  fake.finish(id, { exitCode: 0 }); // finishes anyway after the abort
  const run = await d.waitFor(id);
  assert.equal(run.outcome, 'cancelled', 'abort reason wins over the exit code');
});

test('output cap: truncates on the byte budget, aborts, outcome output_limit', async () => {
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits({ outputLimitBytes: 10 }), [fake]));
  const id = d.submitRun(input('a'));
  await tick();
  const ctx = fake.ctx(id);
  assert.equal(ctx.output('12345'), true);
  assert.equal(ctx.output('67890abc'), false);
  assert.equal(ctx.output('more'), false);
  const run = await d.waitFor(id);
  assert.equal(run.output, '1234567890');
  assert.equal(run.truncated, true);
  assert.equal(run.outcome, 'output_limit');
});

test('event stream: state, output, done; late subscriber gets a replay', async () => {
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits({ maxConcurrent: 1 }), [fake]));
  const a = d.submitRun(input('a'));
  const b = d.submitRun(input('b'));
  await tick();
  const seen: RunEvent[] = [];
  d.subscribe(b, (e) => seen.push(e));
  fake.finish(a);
  await tick();
  await tick();
  fake.ctx(b).output('hi\n');
  fake.finish(b, { exitCode: 1 });
  await d.waitFor(b);
  assert.deepEqual(
    seen.map((e) => e.type),
    ['state', 'state', 'output', 'done'],
  );
  assert.deepEqual(seen[0], { type: 'state', state: 'queued', queuePosition: 1 });
  assert.deepEqual(seen[1], { type: 'state', state: 'running', queuePosition: 0 });
  assert.equal((seen[3] as Extract<RunEvent, { type: 'done' }>).outcome, 'failed');

  const late: RunEvent[] = [];
  d.subscribe(b, (e) => late.push(e));
  assert.deepEqual(
    late.map((e) => e.type),
    ['state', 'output', 'done'],
  );
});

test('backend outcome mapping, oom and thrown errors', async () => {
  const fake = new FakeBackend('go');
  (fake as Backend).outcomeFor = (kind, code) => (kind === 'test' && code === 10 ? 'unformatted' : code === 0 ? 'passed' : 'failed');
  const d = track(new Dispatcher(limits(), [fake]));
  const t = d.submitRun(input('a', 'test'));
  const o = d.submitRun(input('b'));
  await tick();
  fake.finish(t, { exitCode: 10 });
  fake.finish(o, { exitCode: 1, oomKilled: true });
  assert.equal((await d.waitFor(t)).outcome, 'unformatted');
  assert.equal((await d.waitFor(o)).outcome, 'oom');

  const broken: Backend = { language: 'js', run: async () => Promise.reject(new Error('boom')) };
  d.register(broken);
  const e = d.submitRun(input('c', 'run', 'js'));
  assert.equal((await d.waitFor(e)).outcome, 'error');
});

test('format goes through the queue without cooldown', async () => {
  const fake = new FakeBackend('go');
  const d = track(new Dispatcher(limits({ maxConcurrent: 1 }), [fake]));
  const a = d.submitRun(input('a'));
  const p = d.submitFormat({ user: 'a', language: 'go', files: { 'x.go': 'package x' } });
  await tick();
  assert.equal(d.queueDepth, 1, 'format waits for the slot');
  fake.finish(a);
  await tick();
  await tick();
  const fmt = fake.started[1]!;
  assert.equal(fmt.kind, 'format');
  fake.finish(fmt.id, { exitCode: 0, files: { 'x.go': 'package x\n' } });
  assert.deepEqual(await p, { ok: true, files: { 'x.go': 'package x\n' }, outcome: 'passed' });
  // A second format right away is fine.
  const p2 = d.submitFormat({ user: 'a', language: 'go', files: {} });
  await tick();
  fake.finish(fake.started[2]!.id, { exitCode: 3, error: 'syntax error' });
  assert.deepEqual(await p2, { ok: false, error: 'syntax error', outcome: 'failed' });
});

test('queue cap and exclusive-per-user backends', async () => {
  const go = new FakeBackend('go');
  const rust = new FakeBackend('rust', true);
  const d = track(new Dispatcher(limits({ maxConcurrent: 1, queueMax: 1 }), [go, rust]));
  d.submitRun(input('a', 'run', 'rust'));
  await tick();
  assert.throws(() => d.submitRun(input('a', 'test', 'rust')), BusyError);
  d.submitRun(input('b'));
  assert.throws(() => d.submitRun(input('c')), QueueFullError);
});

test('DockerDemuxer: frames split across chunks and several frames per chunk', () => {
  const frame = (stream: number, s: string) => {
    const body = Buffer.from(s, 'utf8');
    const h = Buffer.alloc(8);
    h[0] = stream;
    h.writeUInt32BE(body.length, 4);
    return Buffer.concat([h, body]);
  };
  const all = Buffer.concat([frame(1, 'hello '), frame(2, 'wörld'), frame(1, '!\n')]);
  // Feed one byte at a time: worst case for a naive parser.
  const d = new DockerDemuxer();
  let out = '';
  for (let i = 0; i < all.length; i++) out += d.push(all.subarray(i, i + 1));
  out += d.end();
  assert.equal(out, 'hello wörld!\n');

  const d2 = new DockerDemuxer();
  assert.equal(d2.push(all) + d2.end(), 'hello wörld!\n');

  // Unframed (TTY) stream passes through.
  const d3 = new DockerDemuxer();
  assert.equal(d3.push(Buffer.from('plain text')) + d3.end(), 'plain text');
});
