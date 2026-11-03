#!/usr/bin/env node
/**
 * Measure what a graded run actually costs, against a container configured
 * exactly as server/src/services/runner.ts configures one.
 *
 *   node tools/measure-runner.mjs --cpus 0.5 --memory 384 --limit 10
 *   node tools/measure-runner.mjs --cpus 2   --memory 1024 --limit 10
 *
 * Self-contained on purpose: the deployed release carries no tools/ and no
 * devDependencies, so this must run on the VM with nothing but node and the
 * docker CLI.
 *
 * Two numbers per exercise, and the difference between them is the whole point:
 *
 *   cold — first `cargo test` for this exercise in a fresh /workspace volume
 *   warm — the same run again, with target/ already populated
 *
 * That gap is what a per-user volume buys, and it is exactly what a migration
 * to a request-scoped platform would give up (docs/10-cloud-run.md §8.1).
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { promisify } from 'node:util'

const exec = promisify(execFile)
const ROOT = process.cwd()
const CONTENT = path.join(ROOT, 'content')

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : dflt
}
const CPUS = arg('cpus', '0.5')
const MEMORY = arg('memory', '384')
const LIMIT = Number(arg('limit', '0'))
const IMAGE = arg('image', 'rust-checkpoints-runner:latest')
const STARTERS = process.argv.includes('--starters')
const BACKEND = arg('backend', 'docker')
const URL = arg('url', process.env.RUNNER_CLOUDRUN_URL ?? '')
const NAME = `rc-measure-${process.pid}`
const VOLUME = `rc-measure-vol-${process.pid}`

const index = JSON.parse(fs.readFileSync(path.join(CONTENT, 'index.json'), 'utf8'))
let metas = index.exercises.map((e) =>
  JSON.parse(fs.readFileSync(path.join(CONTENT, 'exercises', e.slug, 'meta.json'), 'utf8')),
)
if (LIMIT) metas = metas.slice(0, LIMIT)

/** Same manifest the backend writes — see server/src/services/exercises.ts. */
function manifest(name, edition, deps, pathDep) {
  const lines = ['[package]', `name = "${name}"`, 'version = "0.1.0"', `edition = "${edition}"`, '', '[dependencies]']
  if (pathDep) lines.push(`${pathDep} = { path = "../${pathDep}" }`)
  for (const d of deps ?? []) lines.push(`${d.name} = "${d.version}"`)
  return `${lines.join('\n')}\n`
}

/** <slug>/ and <slug>_test/ as siblings, exactly as materialiseFiles() lays them out. */
function filesFor(meta, useSolution) {
  const src = path.join(CONTENT, 'exercises', meta.slug)
  const body = fs.readFileSync(path.join(src, useSolution ? 'solution.rs' : 'starter.rs'), 'utf8')
  const files = [
    { path: `${meta.slug}/Cargo.toml`, content: manifest(meta.slug, meta.edition, []) },
    {
      path: `${meta.slug}_test/Cargo.toml`,
      content: manifest(`${meta.slug}_test`, meta.testEdition, meta.deps, meta.kind === 'lib' ? meta.slug : undefined),
    },
    {
      path: `${meta.slug}_test/src/${meta.testShape === 'lib' ? 'lib.rs' : 'main.rs'}`,
      content: fs.readFileSync(path.join(src, 'test.rs'), 'utf8'),
    },
  ]
  if (meta.kind === 'lib') {
    files.push({ path: `${meta.slug}/src/lib.rs`, content: body })
    files.push({ path: `${meta.slug}/src/main.rs`, content: fs.readFileSync(path.join(src, 'main.rs'), 'utf8') })
  } else {
    files.push({ path: `${meta.slug}/src/main.rs`, content: body })
  }
  return files
}

async function sh(cmd, args, opts = {}) {
  return exec(cmd, args, { maxBuffer: 64 << 20, ...opts })
}

async function startContainer() {
  await sh('docker', ['rm', '-f', NAME]).catch(() => {})
  await sh('docker', ['volume', 'rm', '-f', VOLUME]).catch(() => {})
  // Mirrors runner.ts createContainer(): same user, limits, isolation and the
  // disk-backed per-user volume at /workspace.
  await sh('docker', [
    'run', '-d', '--name', NAME,
    '--user', '10001',
    '-w', '/workspace',
    '--memory', `${MEMORY}m`, '--memory-swap', `${MEMORY}m`,
    '--cpus', String(CPUS),
    '--pids-limit', '256',
    '--network', 'none',
    '--cap-drop', 'ALL',
    '--read-only',
    '-v', `${VOLUME}:/workspace`,
    '--tmpfs', '/tmp:rw,size=32m',
    IMAGE, 'sleep', 'infinity',
  ])
}

async function writeFiles(files) {
  // A staging dir, tarred with the container user's ownership. `docker cp` would
  // otherwise land root-owned files that uid 10001 cannot write into, and every
  // cargo build would fail on permissions rather than on the code.
  const stage = fs.mkdtempSync(path.join('/tmp', 'rc-stage-'))
  try {
    for (const f of files) {
      const target = path.join(stage, f.path)
      fs.mkdirSync(path.dirname(target), { recursive: true })
      fs.writeFileSync(target, f.content)
    }
    const tar = path.join(stage, '.payload.tar')
    await sh('tar', ['--owner=10001', '--group=10001', '-cf', tar, '-C', stage, ...files.map((f) => f.path.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i)])
    await sh('sh', ['-c', `docker cp - ${NAME}:/workspace < ${JSON.stringify(tar)}`])
  } finally {
    fs.rmSync(stage, { recursive: true, force: true })
  }
}

async function cargoTest(slug) {
  const t0 = Date.now()
  try {
    await sh('docker', ['exec', '-w', `/workspace/${slug}_test`, NAME, 'cargo', 'test', '--offline', '--quiet'], { timeout: 180_000 })
    return { exitCode: 0, ms: Date.now() - t0 }
  } catch (e) {
    return { exitCode: e.killed ? 'TIMEOUT' : (e.code ?? -1), ms: Date.now() - t0 }
  }
}

const pct = (a, p) => (a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor((a.length * p) / 100))] : 0)

// ── Cloud Run backend ────────────────────────────────────────────────────────
// Every request builds cold by construction: the wrapper gives each one its own
// workspace because a shared CARGO_TARGET_DIR deadlocks the recursive-cargo
// suites (docker/runner/Dockerfile). So there is no warm number to report here —
// that is the finding, not a gap in the measurement.
let cachedToken = null
async function idToken() {
  if (cachedToken && Date.now() < cachedToken.exp) return cachedToken.v
  const r = await fetch(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(URL)}`,
    { headers: { 'Metadata-Flavor': 'Google' } },
  )
  if (!r.ok) throw new Error(`metadata server: HTTP ${r.status}`)
  cachedToken = { v: (await r.text()).trim(), exp: Date.now() + 30 * 60_000 }
  return cachedToken.v
}

async function viaCloudRun(meta, useSolution) {
  const body = JSON.stringify({
    exercise: meta.slug,
    kind: 'test',
    files: filesFor(meta, useSolution),
    args: [],
  })
  const t0 = Date.now()
  try {
    const res = await fetch(`${URL}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await idToken()}` },
      body,
      signal: AbortSignal.timeout(180_000),
    })
    const text = await res.text()
    if (!res.ok) return { exitCode: `HTTP${res.status}`, ms: Date.now() - t0 }
    const done = JSON.parse(text.trimEnd().split('\n').pop())
    return { exitCode: done.exitCode, ms: Date.now() - t0 }
  } catch (e) {
    return { exitCode: `ERR:${e.name}`, ms: Date.now() - t0 }
  }
}

async function mainCloudRun() {
  if (!URL) {
    console.error('error: --url or RUNNER_CLOUDRUN_URL is required for the cloudrun backend')
    process.exit(1)
  }
  console.log(`measure: backend=cloudrun url=${URL} exercises=${metas.length}`)
  const first = []
  const second = []
  const wrong = []
  for (const meta of metas) {
    const a = await viaCloudRun(meta, true)
    const b = await viaCloudRun(meta, true)
    if (a.exitCode !== 0) wrong.push(`${meta.slug}: solution did not pass (exit ${a.exitCode})`)
    else { first.push(a.ms); second.push(b.ms) }
    process.stdout.write(a.exitCode === 0 ? '.' : 'F')
    if (STARTERS) {
      const s = await viaCloudRun(meta, false)
      if (s.exitCode === 0) wrong.push(`${meta.slug}: STARTER PASSED — state leaked between requests`)
      process.stdout.write(s.exitCode === 0 ? 'X' : ',')
    }
  }
  console.log(`\n\n  passed: ${first.length}/${metas.length}`)
  for (const w of wrong) console.log(`    ✗ ${w}`)
  console.log(`  1st request  p50=${pct(first, 50)}ms  p90=${pct(first, 90)}ms  max=${Math.max(...first, 0)}ms`)
  console.log(`  2nd request  p50=${pct(second, 50)}ms  p90=${pct(second, 90)}ms  max=${Math.max(...second, 0)}ms`)
  console.log('  (both build cold: the wrapper gives every request its own workspace)')
  if (wrong.length) process.exitCode = 1
}

async function main() {
  console.log(`measure: cpus=${CPUS} memory=${MEMORY}m image=${IMAGE} exercises=${metas.length}`)
  await startContainer()
  const cold = []
  const warm = []
  const wrong = []
  try {
    for (const meta of metas) {
      await writeFiles(filesFor(meta, true))
      const c = await cargoTest(meta.slug)
      const w = await cargoTest(meta.slug)
      if (c.exitCode !== 0) wrong.push(`${meta.slug}: solution did not pass (exit ${c.exitCode})`)
      else { cold.push(c.ms); warm.push(w.ms) }
      process.stdout.write(c.exitCode === 0 ? '.' : 'F')

      if (STARTERS) {
        await writeFiles(filesFor(meta, false))
        const s = await cargoTest(meta.slug)
        if (s.exitCode === 0) wrong.push(`${meta.slug}: STARTER PASSED — state leaked`)
        process.stdout.write(s.exitCode === 0 ? 'X' : ',')
        // Put the solution back so the next exercise starts from a clean state.
        await writeFiles(filesFor(meta, true))
      }
    }
  } finally {
    await sh('docker', ['rm', '-f', NAME]).catch(() => {})
    await sh('docker', ['volume', 'rm', '-f', VOLUME]).catch(() => {})
  }

  console.log(`\n\n  passed: ${cold.length}/${metas.length}`)
  for (const w of wrong) console.log(`    ✗ ${w}`)
  console.log(`  cold  p50=${pct(cold, 50)}ms  p90=${pct(cold, 90)}ms  max=${Math.max(...cold, 0)}ms`)
  console.log(`  warm  p50=${pct(warm, 50)}ms  p90=${pct(warm, 90)}ms  max=${Math.max(...warm, 0)}ms`)
  const ratio = pct(warm, 50) ? (pct(cold, 50) / pct(warm, 50)).toFixed(1) : 'n/a'
  console.log(`  the per-user volume is worth ${ratio}x at p50 — that is what a request-scoped platform gives up`)
  if (wrong.length) process.exitCode = 1
}

await (BACKEND === 'cloudrun' ? mainCloudRun() : main())
