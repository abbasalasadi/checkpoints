/**
 * Exercise content, read from content/ at startup.
 *
 * Cargo manifests are generated here rather than stored: all 195 originals
 * reduced to one template (docs/01-canonical.md).
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fromRoot } from '../config/paths.js';

const CONTENT = fromRoot('content');

export interface Meta {
  slug: string;
  kind: 'lib' | 'bin';
  edition: string;
  testEdition: string;
  argv: boolean;
  testShape: 'lib' | 'main';
  deps: { name: string; version: string }[];
  placements: { checkpoint: string; level: number }[];
}

export interface Exercise extends Meta {
  readme: string;
  starter: string;
  mainRs: string;
  /** Never sent to the browser as editable content. */
  test: string;
}

export interface Placement {
  exercise: string;
  checkpoint: string;
  level: number;
}

const index = JSON.parse(readFileSync(join(CONTENT, 'index.json'), 'utf8')) as {
  exercises: { slug: string }[];
  placements: Placement[];
};

const cache = new Map<string, Exercise>();

for (const { slug } of index.exercises) {
  const dir = join(CONTENT, 'exercises', slug);
  const meta = JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8')) as Meta;
  cache.set(slug, {
    ...meta,
    readme: readFileSync(join(dir, 'README.md'), 'utf8'),
    starter: readFileSync(join(dir, 'starter.rs'), 'utf8'),
    mainRs: readFileSync(join(dir, 'main.rs'), 'utf8'),
    test: readFileSync(join(dir, 'test.rs'), 'utf8'),
  });
}

export const placements: Placement[] = index.placements;

export function listExercises(): { slug: string; kind: string; argv: boolean }[] {
  return [...cache.values()].map((e) => ({ slug: e.slug, kind: e.kind, argv: e.argv }));
}

export function getExercise(slug: string): Exercise | undefined {
  return cache.get(slug);
}

function manifest(name: string, edition: string, deps: Meta['deps'], pathDep?: string): string {
  const lines = ['[package]', `name = "${name}"`, 'version = "0.1.0"', `edition = "${edition}"`, '', '[dependencies]'];
  if (pathDep) lines.push(`${pathDep} = { path = "../${pathDep}" }`);
  for (const d of deps) lines.push(`${d.name} = "${d.version}"`);
  return `${lines.join('\n')}\n`;
}

/**
 * Files to write into the student's container for one exercise.
 *
 * The test crate is included on EVERY materialise, straight from content/. That
 * is what stops a student weakening the assertions: whatever they may have left
 * in the container is overwritten before the run.
 *
 * <slug>/ and <slug>_test/ must stay siblings — four test crates reference
 * ../<slug>/Cargo.toml by relative path.
 */
export function materialiseFiles(
  ex: Exercise,
  student: { libRs?: string | null; mainRs?: string | null },
): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [
    { path: `${ex.slug}/Cargo.toml`, content: manifest(ex.slug, ex.edition, []) },
    {
      path: `${ex.slug}_test/Cargo.toml`,
      // A bin-only exercise has no lib target, so a path dependency on it is
      // invalid; its test drives the binary through `cargo run` instead.
      content: manifest(`${ex.slug}_test`, ex.testEdition, ex.deps, ex.kind === 'lib' ? ex.slug : undefined),
    },
    {
      path: `${ex.slug}_test/src/${ex.testShape === 'lib' ? 'lib.rs' : 'main.rs'}`,
      content: ex.test,
    },
  ];

  if (ex.kind === 'lib') {
    files.push({ path: `${ex.slug}/src/lib.rs`, content: student.libRs ?? ex.starter });
    files.push({ path: `${ex.slug}/src/main.rs`, content: student.mainRs ?? ex.mainRs });
  } else {
    files.push({ path: `${ex.slug}/src/main.rs`, content: student.mainRs ?? student.libRs ?? ex.starter });
  }

  return files;
}
