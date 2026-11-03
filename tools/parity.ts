/**
 * Runner parity: every exercise, through the real runner module, as the server
 * routes shape it.
 *
 *   npx tsx tools/parity.ts [--lang go|js|rust] [--only slug,...] [--concurrency 3]
 *
 * Per exercise, two 'test' jobs: the reference solution must end `passed`, the
 * starter must end neither `passed` nor `error` (an infrastructure failure is
 * not a verdict). Per language, one 'run' job (an argv exercise with arguments
 * when one exists) must end passed|failed; for Go, one format job must succeed.
 *
 * Cooldowns are bypassed in-process only: jobs go out under a small pool of
 * fake users ("parity-w<n>") whose clocks are cleared before each submit.
 * Production settings are untouched.
 *
 * Output: a table per language, var/parity/<lang>.json, exit 1 on any mismatch.
 * Needs Docker and the runner images; run it on the VM (make parity).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['go', 'js', 'rust'] as const;
type Lang = (typeof LANGS)[number];

const HELP = `usage: npx tsx tools/parity.ts [--lang go|js|rust] [--only slug,...] [--concurrency N]

  --lang         one language (default: all three)
  --only         comma-separated slugs (default: every exercise)
  --concurrency  jobs in flight at once (default 3, the dispatcher's cap)

Drives server/src/services/runner in 'test' mode with each exercise's solution
(expect passed) and starter (expect not passed), plus one 'run' job per
language and one Go format job. Writes var/parity/<lang>.json; exits 1 on any
mismatch. Needs Docker and the runner images (run on the VM: make parity).`;

// ── args (before any server import, so --help needs nothing) ────────────────

const argv = process.argv.slice(2);
if (argv.includes('--help') || argv.includes('-h')) {
  console.log(HELP);
  process.exit(0);
}
function opt(name: string): string | undefined {
  const i = argv.indexOf(name);
  if (i < 0) return undefined;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) {
    console.error(`${name} needs a value\n\n${HELP}`);
    process.exit(2);
  }
  return v;
}
const langArg = opt('--lang');
if (langArg && !(LANGS as readonly string[]).includes(langArg)) {
  console.error(`unknown --lang ${langArg}\n\n${HELP}`);
  process.exit(2);
}
const langs: Lang[] = langArg ? [langArg as Lang] : [...LANGS];
const only = opt('--only')?.split(',').map((s) => s.trim()).filter(Boolean) ?? null;
const concurrency = Math.max(1, Number.parseInt(opt('--concurrency') ?? '3', 10) || 3);

// Keep the server's logger away from var/logs/backend.log (it truncates on open)
// and quiet unless asked; the Rust usage hooks warn without a DB.
process.env.LOG_DIR ??= 'var/parity/logs';
process.env.LOG_LEVEL ??= 'error';

const exercisesMod = await import('../server/src/services/exercises.js');
const runner = await import('../server/src/services/runner/index.js');
const { getExercise, listExercises, workingFiles, filesForRunner, runnerExerciseMeta } = exercisesMod;
type Exercise = NonNullable<ReturnType<typeof getExercise>>;
type RunRecord = Awaited<ReturnType<typeof runner.waitForRun>>;

// ── helpers ──────────────────────────────────────────────────────────────────

const EXT: Record<Lang, string> = { go: 'go', js: 'js', rust: 'rs' };

function exerciseDir(lang: Lang, slug: string): string {
  const base = join(ROOT, 'content', lang);
  try {
    const idx = JSON.parse(readFileSync(join(base, 'index.json'), 'utf8')) as { exercises?: { slug: string; dir?: string }[] };
    const dir = idx.exercises?.find((e) => e.slug === slug)?.dir;
    if (dir) return join(base, dir);
  } catch {
    /* fall through */
  }
  return join(base, 'exercises', slug);
}

/** Starter with the reference solution standing in for the graded file. */
function solutionFiles(ex: Exercise): Record<string, string> | null {
  const files = (ex.meta.files ?? {}) as { solution?: string };
  const name = files.solution ?? `solution.${EXT[ex.language]}`;
  let src: string;
  try {
    src = readFileSync(join(exerciseDir(ex.language, ex.slug), name), 'utf8');
  } catch {
    return null;
  }
  const graded = ex.expectedFiles[0];
  if (!graded) return null;
  return { ...ex.starter, [graded]: src };
}

const pool = Array.from({ length: concurrency }, (_, i) => `parity-w${i + 1}`);
const freeUsers = [...pool];
const waiters: ((u: string) => void)[] = [];
function takeUser(): Promise<string> {
  const u = freeUsers.shift();
  return u ? Promise.resolve(u) : new Promise((r) => waiters.push(r));
}
function giveUser(u: string): void {
  const w = waiters.shift();
  if (w) w(u);
  else freeUsers.push(u);
}

interface JobResult {
  outcome: string;
  exitCode: number | null;
  durationMs: number | null;
  tail: string;
}

async function job(ex: Exercise, working: Record<string, string>, mode: 'run' | 'test', args: string[] = []): Promise<JobResult> {
  const user = await takeUser();
  try {
    runner.dispatcher.clearCooldown(user);
    const id = runner.submitRun({
      user,
      language: ex.language,
      slug: ex.slug,
      files: filesForRunner(ex, working, mode),
      args,
      mode,
      exercise: runnerExerciseMeta(ex),
    });
    const run: RunRecord = await runner.waitForRun(id);
    return {
      outcome: run.outcome ?? 'error',
      exitCode: run.exitCode,
      durationMs: run.durationMs,
      tail: run.output.slice(-2000),
    };
  } catch (err) {
    return { outcome: 'error', exitCode: null, durationMs: null, tail: String(err instanceof Error ? err.message : err) };
  } finally {
    runner.dispatcher.clearCooldown(user);
    giveUser(user);
  }
}

interface Row {
  slug: string;
  solution: JobResult | null;
  starter: JobResult;
  ok: boolean;
  problem?: string;
}

const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));
const secs = (ms: number | null) => (ms === null ? '-' : `${(ms / 1000).toFixed(1)}s`);

// ── main ─────────────────────────────────────────────────────────────────────

let anyMismatch = false;
const outDir = join(ROOT, 'var', 'parity');
mkdirSync(outDir, { recursive: true });

try {
  try {
    await runner.preflightRunners(langs);
  } catch (err) {
    console.error(`preflight failed: ${String(err instanceof Error ? err.message : err)}`);
    process.exitCode = 1;
    throw err;
  }
  runner.startRunners();

  for (const lang of langs) {
    const all = listExercises(lang).map((e) => e.slug);
    const slugs = only ? all.filter((s) => only.includes(s)) : all;
    if (only) for (const s of only.filter((s) => !all.includes(s) && langs.length === 1)) console.warn(`  ${lang}: no exercise ${s}`);
    console.log(`\n== ${lang}: ${slugs.length} exercises, concurrency ${concurrency}`);

    const started = Date.now();
    const rows: Row[] = await Promise.all(
      slugs.map(async (slug): Promise<Row> => {
        const ex = getExercise(lang, slug)!;
        const sol = solutionFiles(ex);
        const [solution, starter] = await Promise.all([
          sol ? job(ex, sol, 'test') : Promise.resolve(null),
          job(ex, workingFiles(ex, null), 'test'),
        ]);
        let problem: string | undefined;
        if (!solution) problem = 'no solution file';
        else if (solution.outcome !== 'passed') problem = `solution ${solution.outcome}`;
        else if (starter.outcome === 'passed') problem = 'starter passed';
        else if (starter.outcome === 'error') problem = 'starter error';
        const row: Row = { slug, solution, starter, ok: !problem, problem };
        console.log(
          `  ${row.ok ? 'ok  ' : 'FAIL'} ${pad(slug, 34)} solution=${pad(solution?.outcome ?? '-', 12)} ${pad(secs(solution?.durationMs ?? null), 7)}` +
            ` starter=${pad(starter.outcome, 12)} ${pad(secs(starter.durationMs), 7)}${problem ? `  <- ${problem}` : ''}`,
        );
        return row;
      }),
    );
    rows.sort((a, b) => a.slug.localeCompare(b.slug));

    // One 'run' job: an argv exercise with arguments when one exists.
    const runPick =
      slugs.map((s) => getExercise(lang, s)!).find((e) => e.argv && solutionFiles(e)) ??
      slugs.map((s) => getExercise(lang, s)!).find((e) => solutionFiles(e));
    let runCheck: (JobResult & { slug: string; args: string[]; ok: boolean }) | null = null;
    if (runPick) {
      const args = runPick.argv ? ['hello world', 'abc'] : [];
      const r = await job(runPick, solutionFiles(runPick)!, 'run', args);
      const ok = r.outcome === 'passed' || r.outcome === 'failed';
      runCheck = { ...r, slug: runPick.slug, args, ok };
      console.log(`  run  ${ok ? 'ok  ' : 'FAIL'} ${runPick.slug} args=${JSON.stringify(args)} -> ${r.outcome} (exit ${r.exitCode})`);
      if (!ok) console.log(r.tail.split('\n').slice(-10).map((l) => `       | ${l}`).join('\n'));
    }

    // One Go format job.
    let formatCheck: { slug: string; ok: boolean; outcome: string; error?: string } | null = null;
    if (lang === 'go' && runPick) {
      const files = filesForRunner(runPick, solutionFiles(runPick)!, 'test');
      try {
        const f = await runner.submitFormat({ user: 'parity-format', language: 'go', files });
        formatCheck = { slug: runPick.slug, ok: f.ok, outcome: f.outcome, error: f.ok ? undefined : f.error };
      } catch (err) {
        formatCheck = { slug: runPick.slug, ok: false, outcome: 'error', error: String(err) };
      }
      console.log(`  fmt  ${formatCheck.ok ? 'ok  ' : 'FAIL'} ${runPick.slug} -> ${formatCheck.outcome}${formatCheck.error ? ` ${formatCheck.error}` : ''}`);
    }

    const bad = rows.filter((r) => !r.ok);
    const mismatch = bad.length > 0 || (runCheck !== null && !runCheck.ok) || (formatCheck !== null && !formatCheck.ok);
    anyMismatch ||= mismatch;

    console.log(
      `  -- ${lang}: ${rows.length - bad.length}/${rows.length} ok` +
        (runCheck ? `, run ${runCheck.ok ? 'ok' : 'FAIL'}` : '') +
        (formatCheck ? `, format ${formatCheck.ok ? 'ok' : 'FAIL'}` : '') +
        `, ${((Date.now() - started) / 1000).toFixed(0)}s`,
    );
    for (const r of bad) {
      const tail = (r.problem?.startsWith('starter') ? r.starter : r.solution)?.tail ?? '';
      console.log(`     ${r.slug}: ${r.problem}`);
      if (tail) console.log(tail.split('\n').slice(-8).map((l) => `       | ${l}`).join('\n'));
    }

    const report = {
      language: lang,
      at: new Date().toISOString(),
      concurrency,
      only,
      total: rows.length,
      ok: rows.length - bad.length,
      mismatches: bad.map((r) => ({ slug: r.slug, problem: r.problem })),
      run: runCheck,
      format: formatCheck,
      exercises: rows,
    };
    writeFileSync(join(outDir, `${lang}.json`), `${JSON.stringify(report, null, 2)}\n`);
    console.log(`  wrote var/parity/${lang}.json`);
  }
} catch (err) {
  if (!process.exitCode) console.error(err);
  anyMismatch = true;
} finally {
  await runner.stopRunners().catch(() => undefined);
}

console.log(`\n${anyMismatch ? 'PARITY FAILED' : 'parity ok'}`);
process.exit(anyMismatch ? 1 : 0);
