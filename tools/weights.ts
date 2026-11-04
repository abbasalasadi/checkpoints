/**
 * V4 step 1 — weight importer (docs/01_design/08_marks.md, D35).
 *
 * Reads the program list (several JSON documents back to back, owner's
 * `list.json`), takes every checkpoint (`type: exam`) and its exercises'
 * `baseXp` + `category`, and writes them onto our placements:
 *   content/<lang>/index.json, content/<lang>/exercises/<slug>/meta.json,
 *   content/<lang>/sources/weights.json (the extracted numbers, kept after
 *   list.json is deleted). With no list given, re-applies weights.json.
 * Guard: fails when a listed exercise has no placement, or a placement in a
 * listed checkpoint has no weight. Idempotent.
 *
 *   node tools/weights.ts [--list list.json]
 */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['go', 'js', 'rust', 'java'] as const;
type Lang = (typeof LANGS)[number];
type Weight = { baseXp: number; category: string; id?: number; difficulty?: number };
type Weights = Record<string, Record<string, Weight>>; // checkpoint → slug → weight

const listArg = process.argv.indexOf('--list');
const LIST = listArg > 0 ? resolve(process.argv[listArg + 1]) : null;

/** Java names in the list that are not the kebab form of our slug. */
const JAVA_ALIAS: Record<string, string> = { 'almost-palindrome': 'almost-palindrom', 'h-t-m-l-validator': 'html-validator' };

function documents(text: string): unknown[] {
  const out: unknown[] = [];
  let depth = 0, start = -1, inStr = false, esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{' || c === '[') { if (depth++ === 0) start = i; }
    else if (c === '}' || c === ']') { if (--depth === 0) out.push(JSON.parse(text.slice(start, i + 1))); }
  }
  return out;
}

function* nodes(o: unknown): Generator<any> {
  if (Array.isArray(o)) for (const x of o) yield* nodes(x);
  else if (o && typeof o === 'object') {
    const n = o as any;
    if (typeof n.type === 'string' && typeof n.name === 'string') yield n;
    for (const v of Object.values(n)) if (v && typeof v === 'object') yield* nodes(v);
  }
}

/** "Checkpoint 01-java" → java/1, "checkpoint final-js" → js/final, "Checkpoint-03-retest" → go/retest. */
function checkpointOf(name: string): { lang: Lang; checkpoint: string } {
  const n = name.toLowerCase();
  const lang: Lang = n.endsWith('-java') ? 'java' : n.endsWith('-js') ? 'js' : n.endsWith('-rust') ? 'rust' : 'go';
  if (n.includes('retest')) return { lang, checkpoint: 'retest' };
  if (n.includes('final')) return { lang, checkpoint: 'final' };
  const m = n.match(/(\d+)/);
  if (!m) throw new Error(`unknown checkpoint name: ${name}`);
  return { lang, checkpoint: String(Number(m[1])) };
}

function slugOf(lang: Lang, name: string): string {
  if (lang !== 'java') return name;
  const kebab = name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
  const spelled = name.replace(/([A-Z])/g, '-$1').replace(/^-/, '').toLowerCase();
  return JAVA_ALIAS[kebab] ?? JAVA_ALIAS[spelled] ?? kebab;
}

/**
 * JS weights in the list are partly placeholders (50 XP next to thousands).
 * Balanced like Go/Rust/Java (owner, 2026-11-04): level n weighs n steps; only
 * the last level is optional, when the checkpoint has any optional at all.
 */
const BALANCE = new Set<Lang>(['js']);
const STEP = 1000;

function balance(placements: any[]): void {
  const byCp = new Map<string, any[]>();
  for (const p of placements) byCp.set(p.checkpoint, [...(byCp.get(p.checkpoint) ?? []), p]);
  for (const ps of byCp.values()) {
    const top = Math.max(...ps.map((p) => p.level));
    const optional = ps.some((p) => p.category === 'optional');
    for (const p of ps) {
      p.baseXp = p.level * STEP;
      p.category = optional && p.level === top ? 'optional' : 'required';
    }
  }
}

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const weightsFile = (lang: Lang) => join(ROOT, 'content', lang, 'sources', 'weights.json');

function fromList(path: string): Record<Lang, Weights> {
  const out = Object.fromEntries(LANGS.map((l) => [l, {}])) as Record<Lang, Weights>;
  for (const doc of documents(readFileSync(path, 'utf8'))) {
    for (const exam of nodes(doc)) {
      if (exam.type !== 'exam') continue;
      const { lang, checkpoint } = checkpointOf(exam.name);
      const into = (out[lang][checkpoint] ??= {});
      for (const ex of nodes(exam.children ?? {})) {
        if (ex.type !== 'exercise' || typeof ex.attrs?.baseXp !== 'number') continue;
        into[slugOf(lang, ex.name)] = { baseXp: ex.attrs.baseXp, category: ex.attrs.category ?? 'required', id: ex.id, difficulty: ex.attrs.difficulty };
      }
    }
  }
  return out;
}

const all: Record<Lang, Weights> = LIST
  ? fromList(LIST)
  : (Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(weightsFile(l), 'utf8')).checkpoints])) as Record<Lang, Weights>);

/**
 * The list is the program (owner, 2026-11-04): checkpoints it lacks are
 * dropped, a checkpoint whose exercise set differs is rebuilt from it (level =
 * weight ÷ the smallest weight), and exercises left without a placement are
 * deleted with their hints.
 */
function sync(lang: Lang, index: any, weights: Weights): void {
  index.placements = index.placements.filter((p: any) => weights[p.checkpoint]);
  if (Array.isArray(index.meta?.checkpoints)) index.meta.checkpoints = index.meta.checkpoints.filter((c: any) => weights[c.checkpoint]);
  for (const [cp, list] of Object.entries(weights)) {
    const ours = index.placements.filter((p: any) => p.checkpoint === cp);
    const same = ours.length === Object.keys(list).length && ours.every((p: any) => list[p.exercise]);
    if (same) continue;
    const step = Math.min(...Object.values(list).map((w) => w.baseXp));
    const rebuilt = Object.entries(list).map(([slug, w], i) => {
      const like = index.placements.find((p: any) => p.exercise === slug) ?? {};
      const level = w.baseXp / step;
      if (!Number.isInteger(level)) throw new Error(`${lang} ${cp}/${slug}: weight ${w.baseXp} is not a multiple of ${step}`);
      return { ...like, exercise: slug, checkpoint: cp, level, order: i, index: i, baseXp: w.baseXp, category: w.category, ...(w.difficulty != null ? { difficulty: w.difficulty } : {}), ...(w.id != null ? { platformId: w.id } : {}) };
    });
    rebuilt.sort((a, b) => a.level - b.level || a.index - b.index);
    const at = index.placements.findIndex((p: any) => p.checkpoint === cp);
    index.placements = index.placements.filter((p: any) => p.checkpoint !== cp);
    index.placements.splice(at < 0 ? index.placements.length : at, 0, ...rebuilt);
    console.log(`${lang} ${cp}: rebuilt from the list (${ours.length} → ${rebuilt.length} placements)`);
  }
  const placed = new Set(index.placements.map((p: any) => p.exercise));
  const gone = index.exercises.filter((e: any) => !placed.has(e.slug)).map((e: any) => e.slug);
  if (!gone.length) return;
  index.exercises = index.exercises.filter((e: any) => placed.has(e.slug));
  for (const slug of gone) rmSync(join(ROOT, 'content', lang, 'exercises', slug), { recursive: true, force: true });
  const hintsPath = join(ROOT, 'content', lang, 'hints.json');
  if (existsSync(hintsPath)) {
    const hints = JSON.parse(readFileSync(hintsPath, 'utf8'));
    for (const slug of gone) delete hints[slug];
    writeFileSync(hintsPath, json(hints));
  }
  console.log(`${lang}: deleted ${gone.join(', ')} (not in the list)`);
}

const problems: string[] = [];
/** Writes wait for the guard: a failed run changes nothing. */
const writes: [string, string][] = [];
const put = (path: string, data: string) => writes.push([path, data]);
for (const lang of LANGS) {
  const weights = all[lang];
  const indexPath = join(ROOT, 'content', lang, 'index.json');
  const index = JSON.parse(readFileSync(indexPath, 'utf8'));
  const seen = new Set<string>();
  const apply = (slug: string, p: any) => {
    const w = weights[p.checkpoint]?.[slug];
    if (!weights[p.checkpoint]) return; // checkpoint not in the list (e.g. Go final): left as is
    if (!w) return problems.push(`${lang} ${p.checkpoint}/${slug}: placement without weight`);
    seen.add(`${p.checkpoint}/${slug}`);
    p.baseXp = w.baseXp;
    p.category = w.category;
  };
  if (LIST) sync(lang, index, weights);
  for (const p of index.placements) apply(p.exercise, p);
  if (BALANCE.has(lang)) balance(index.placements);
  for (const [cp, list] of Object.entries(weights))
    for (const slug of Object.keys(list)) if (!seen.has(`${cp}/${slug}`)) problems.push(`${lang} ${cp}/${slug}: listed but no placement`);
  put(indexPath, json(index));
  for (const e of index.exercises) {
    const metaPath = join(ROOT, 'content', lang, 'exercises', e.slug, 'meta.json');
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (!Array.isArray(meta.placements)) continue;
    const own = index.placements.filter((p: any) => p.exercise === e.slug);
    if (lang === 'go') meta.placements = own.map(({ exercise: _e, ...p }: any) => p);
    else
      for (const p of meta.placements) {
        const q = own.find((x: any) => x.checkpoint === p.checkpoint && x.level === p.level);
        if (q) { p.baseXp = q.baseXp; p.category = q.category; }
      }
    put(metaPath, json(meta));
  }
  if (LIST) mkdirSync(dirname(weightsFile(lang)), { recursive: true });
  if (LIST) put(weightsFile(lang), json({ source: 'program list (owner, 2026-11-04, D35)', checkpoints: weights }));
  const n = Object.values(weights).reduce((s, c) => s + Object.keys(c).length, 0);
  console.log(`${lang}: ${Object.keys(weights).length} checkpoints, ${n} weighted placements`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  console.error('nothing written');
  process.exit(1);
}
for (const [path, data] of writes) writeFileSync(path, data);
