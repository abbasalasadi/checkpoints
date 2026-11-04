/** Shared helpers for the content tools. Paths are relative to the repo root. */

import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const LANGS = ['go', 'js', 'rust', 'java'] as const;
export type Lang = (typeof LANGS)[number];

/** Canonical checkpoint ordering across all three languages. */
export const CHECKPOINT_ORDER = ['1', '2', '3', 'retest', 'final'];

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const contentDir = (lang: Lang) => join(ROOT, 'content', lang);

export interface IndexExercise {
  slug: string;
  language: Lang;
  kind: string;
  argv: boolean;
  dir: string;
  [k: string]: unknown;
}
export interface IndexPlacement {
  exercise: string;
  checkpoint: string;
  level: number;
  order: number | null;
  [k: string]: unknown;
}
export interface ContentIndex {
  schema: 1;
  language: Lang;
  meta: Record<string, unknown>;
  exercises: IndexExercise[];
  placements: IndexPlacement[];
}

export function loadIndex(lang: Lang): ContentIndex {
  return JSON.parse(readFileSync(join(contentDir(lang), 'index.json'), 'utf8')) as ContentIndex;
}

export function parseLang(argv: string[]): Lang {
  const i = argv.indexOf('--lang');
  const v = i >= 0 ? argv[i + 1] : undefined;
  if (!v || !(LANGS as readonly string[]).includes(v)) {
    console.error(`usage: --lang ${LANGS.join('|')}`);
    process.exit(2);
  }
  return v as Lang;
}

export function parseOnly(argv: string[]): string[] | null {
  const i = argv.indexOf('--only');
  return i >= 0 ? argv[i + 1].split(',').filter(Boolean) : null;
}
