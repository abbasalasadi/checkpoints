/**
 * Mock exam selection (V3 feature 1): one random exercise per level of a
 * checkpoint, from the exercises that exist in the content.
 */
import type { Language } from '../languages.js';
import { getExercise, placementsFor } from './exercises.js';

export function pickExamItems(language: Language, checkpoint: string, random: () => number = Math.random): { level: number; slug: string }[] {
  const byLevel = new Map<number, string[]>();
  for (const pl of placementsFor(language)) {
    if (pl.checkpoint !== checkpoint || !getExercise(language, pl.exercise)) continue;
    const list = byLevel.get(pl.level) ?? [];
    if (!list.includes(pl.exercise)) list.push(pl.exercise);
    byLevel.set(pl.level, list);
  }
  const picked: { level: number; slug: string }[] = [];
  for (const level of [...byLevel.keys()].sort((a, b) => a - b)) {
    const pool = byLevel.get(level)!.filter((s) => !picked.some((p) => p.slug === s));
    if (pool.length) picked.push({ level, slug: pool[Math.floor(random() * pool.length)]! });
  }
  return picked;
}
