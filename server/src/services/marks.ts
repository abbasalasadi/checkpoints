/**
 * Weighted marks (V4, D35; docs/01_design/08_marks.md). Weights (`baseXp`) live
 * on the placements and never leave the server: everything here is a percent,
 * rounded to one decimal.
 *
 * - A placement's value = its weight ÷ the checkpoint's required weight, where
 *   the required weight sums, over the required levels, the level's largest weight.
 * - An exam mark sums the values passed; optional pushes it above 100%.
 * - Practice progress weighs each exercise by its best value across checkpoints.
 */
import type { Language } from '../languages.js';
import { placementsFor, type Placement } from './exercises.js';

const round1 = (n: number) => Math.round(n * 10) / 10;
const weightOf = (p: Placement) => (typeof p.baseXp === 'number' && p.baseXp > 0 ? p.baseXp : 0);
const isOptional = (p: Placement) => p.category === 'optional' || p.category === 'bonus';

/** Required weight of one checkpoint; 0 when it has no weights. */
export function requiredWeight(language: Language, checkpoint: string): number {
  const byLevel = new Map<number, number>();
  for (const p of placementsFor(language)) {
    if (p.checkpoint !== checkpoint || isOptional(p)) continue;
    byLevel.set(p.level, Math.max(byLevel.get(p.level) ?? 0, weightOf(p)));
  }
  return [...byLevel.values()].reduce((s, w) => s + w, 0);
}

function rawValue(language: Language, checkpoint: string, slug: string): number | null {
  const p = placementsFor(language).find((x) => x.checkpoint === checkpoint && x.exercise === slug);
  const r = requiredWeight(language, checkpoint);
  if (!p || !r || !weightOf(p)) return null;
  return (weightOf(p) / r) * 100;
}

/** An exercise's value in one checkpoint, in percent; null when unweighted. */
export function valueOf(language: Language, checkpoint: string, slug: string): number | null {
  const v = rawValue(language, checkpoint, slug);
  return v === null ? null : round1(v);
}

/** A placement as the browser sees it: no weight, its value and whether it is optional. */
export function placementView<T extends { checkpoint: string; baseXp?: unknown }>(language: Language, slug: string, p: T) {
  const { baseXp: _w, ...rest } = p;
  return { ...rest, value: valueOf(language, p.checkpoint, slug) };
}

/** The mark of an exam's items, in percent (sum before rounding). */
export function examMark(language: Language, checkpoint: string, items: { slug: string; passed: boolean }[]): number {
  return round1(items.filter((i) => i.passed).reduce((s, i) => s + (rawValue(language, checkpoint, i.slug) ?? 0), 0));
}

/** The best mark an exam could reach: every item passed. */
export function examMaxMark(language: Language, checkpoint: string, slugs: string[]): number {
  return examMark(language, checkpoint, slugs.map((slug) => ({ slug, passed: true })));
}

/** Practice progress of one track, 0–100: passed exercises weighed by their best value. */
export function trackProgress(language: Language, slugs: string[], passed: Set<string>): number {
  const best = new Map<string, number>();
  for (const p of placementsFor(language)) {
    const v = rawValue(language, p.checkpoint, p.exercise) ?? 0;
    best.set(p.exercise, Math.max(best.get(p.exercise) ?? 0, v));
  }
  let total = 0, got = 0;
  for (const slug of slugs) {
    const v = best.get(slug) ?? 0;
    total += v;
    if (passed.has(slug)) got += v;
  }
  return total ? round1((got / total) * 100) : 0;
}
