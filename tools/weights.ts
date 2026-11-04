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
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const LANGS = ['go', 'js', 'rust', 'java'] as const;
type Lang = (typeof LANGS)[number];
type Weight = { baseXp: number; category: string };
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
 * Checkpoints whose exercise set differs from the list: kept with their own
 * weights until the owner decides. Go retest: ours has 10 levels (one exercise
 * each, older snapshot), the list 9 levels and 46 exercises.
 */
const KEEP = new Set(['go/retest']);

const json = (v: unknown) => JSON.stringify(v, null, 2) + '\n';
const weightsFile = (lang: Lang) => join(ROOT, 'content', lang, 'sources', 'weights.json');

function fromList(path: string): Record<Lang, Weights> {
  const out = Object.fromEntries(LANGS.map((l) => [l, {}])) as Record<Lang, Weights>;
  for (const doc of documents(readFileSync(path, 'utf8'))) {
    for (const exam of nodes(doc)) {
      if (exam.type !== 'exam') continue;
      const { lang, checkpoint } = checkpointOf(exam.name);
      if (KEEP.has(`${lang}/${checkpoint}`)) continue;
      const into = (out[lang][checkpoint] ??= {});
      for (const ex of nodes(exam.children ?? {})) {
        if (ex.type !== 'exercise' || typeof ex.attrs?.baseXp !== 'number') continue;
        into[slugOf(lang, ex.name)] = { baseXp: ex.attrs.baseXp, category: ex.attrs.category ?? 'required' };
      }
    }
  }
  return out;
}

const all: Record<Lang, Weights> = LIST
  ? fromList(LIST)
  : (Object.fromEntries(LANGS.map((l) => [l, JSON.parse(readFileSync(weightsFile(l), 'utf8')).checkpoints])) as Record<Lang, Weights>);

const problems: string[] = [];
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
  for (const p of index.placements) apply(p.exercise, p);
  for (const [cp, list] of Object.entries(weights))
    for (const slug of Object.keys(list)) if (!seen.has(`${cp}/${slug}`)) problems.push(`${lang} ${cp}/${slug}: listed but no placement`);
  writeFileSync(indexPath, json(index));
  for (const e of index.exercises) {
    const metaPath = join(ROOT, 'content', lang, 'exercises', e.slug, 'meta.json');
    if (!existsSync(metaPath)) continue;
    const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    if (!Array.isArray(meta.placements)) continue;
    for (const p of meta.placements) {
      const w = weights[p.checkpoint]?.[e.slug];
      if (w) { p.baseXp = w.baseXp; p.category = w.category; }
    }
    writeFileSync(metaPath, json(meta));
  }
  if (LIST) mkdirSync(dirname(weightsFile(lang)), { recursive: true });
  if (LIST) writeFileSync(weightsFile(lang), json({ source: 'program list (owner, 2026-11-04, D35)', checkpoints: weights }));
  const n = Object.values(weights).reduce((s, c) => s + Object.keys(c).length, 0);
  console.log(`${lang}: ${Object.keys(weights).length} checkpoints, ${n} weighted placements`);
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exit(1);
}
