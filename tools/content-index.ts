/**
 * Normalise content/<lang>/index.json to the one schema documented in
 * content/README.md. Idempotent: run it after editing any meta.json or after
 * re-importing a language from its reference repo.
 *
 *   npx tsx tools/content-index.ts [--lang go|js|rust] [--check]
 *
 * --check writes nothing and exits 1 if any index is not already normalised.
 *
 * Rules (no information is dropped, only added or re-ordered):
 *   - top level: { schema: 1, language, meta, exercises, placements }
 *   - every exercise carries slug, language, kind, argv, dir
 *       go:   kind func|prog (as imported)        argv as imported
 *       js:   kind func (from meta.test.mode)     argv false
 *       rust: kind lib|bin (as imported)          argv as imported
 *   - every placement carries exercise, checkpoint, level, order
 *       rust has no order upstream: order = null
 *   - placements sorted by checkpoint (1,2,3,retest,final), level, order, slug
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHECKPOINT_ORDER, LANGS, type Lang, contentDir } from './lib/content.js';

type Obj = Record<string, unknown>;

const argv = process.argv.slice(2);
const only = argv.includes('--lang') ? (argv[argv.indexOf('--lang') + 1] as Lang) : null;
const check = argv.includes('--check');

function normalise(lang: Lang, raw: Obj): Obj {
  const dir = contentDir(lang);
  const exercises = (raw.exercises as Obj[]).map((e) => {
    const slug = e.slug as string;
    const meta = JSON.parse(readFileSync(join(dir, 'exercises', slug, 'meta.json'), 'utf8')) as Obj;
    let kind = e.kind ?? meta.kind;
    if (kind === undefined && lang === 'js') {
      const mode = (meta.test as Obj | undefined)?.mode;
      kind = mode === 'function' ? 'func' : mode;
    }
    const argvFlag = e.argv ?? meta.argv ?? false;
    const { slug: _s, language: _l, kind: _k, argv: _a, dir: _d, ...rest } = e;
    return { slug, language: lang, kind, argv: argvFlag, dir: `exercises/${slug}`, ...rest };
  });

  const rank = (c: string) => {
    const i = CHECKPOINT_ORDER.indexOf(c);
    return i < 0 ? 99 : i;
  };
  const placements = (raw.placements as Obj[])
    .map((p) => {
      const { exercise, checkpoint, level, order, ...rest } = p;
      return { exercise, checkpoint: String(checkpoint), level, order: order ?? null, ...rest };
    })
    .sort(
      (a, b) =>
        rank(a.checkpoint) - rank(b.checkpoint) ||
        (a.level as number) - (b.level as number) ||
        ((a.order as number | null) ?? 0) - ((b.order as number | null) ?? 0) ||
        String(a.exercise).localeCompare(String(b.exercise)),
    );

  const slugs = new Set(exercises.map((e) => e.slug));
  for (const p of placements) {
    if (!slugs.has(p.exercise as string)) throw new Error(`${lang}: placement names unknown exercise ${p.exercise}`);
  }

  return { schema: 1, language: lang, meta: raw.meta ?? {}, exercises, placements };
}

let dirty = 0;
for (const lang of only ? [only] : LANGS) {
  const file = join(contentDir(lang), 'index.json');
  const before = readFileSync(file, 'utf8');
  const after = `${JSON.stringify(normalise(lang, JSON.parse(before) as Obj), null, 2)}\n`;
  if (before === after) {
    console.log(`  ${lang}: already normalised`);
    continue;
  }
  dirty++;
  if (check) console.log(`  ${lang}: NOT normalised`);
  else {
    writeFileSync(file, after);
    console.log(`  ${lang}: written`);
  }
}
process.exit(check && dirty ? 1 : 0);
