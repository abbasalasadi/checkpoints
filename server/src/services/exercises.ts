/**
 * Exercise content for every language, read from content/<lang>/ at startup.
 *
 * Each language keeps its reference's own file layout (docs/v1-contracts.md):
 *   rust  meta.json + README.md + starter.rs + main.rs + test.rs; Cargo
 *         manifests are generated here rather than stored.
 *   go    meta.json (expectedFiles/editorFiles/files) + README.md + starter.go
 *         [+ main.go] + test.go
 *   js    same shape as go with .js files.
 *
 * The loader is tolerant: a missing language directory or index.json is logged
 * and skipped (index.json absent -> exercises/<slug>/meta.json are scanned), so
 * one language's content being incomplete never stops the other two serving.
 * A broken exercise is skipped with a log line, not a crash.
 *
 * Every exercise is presented through one shape: a set of named editor files.
 * Test and solution sources never leave this module except through
 * materialiseFiles / testSource, which the runner uses server-side.
 */

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { config } from '../config/index.js';
import { LANGUAGES, SLUG_PATTERN, SOURCE_EXT, type Language } from '../languages.js';
import { logger } from '../logger.js';

export interface PlacementRef {
  checkpoint: string;
  level: number;
  [extra: string]: unknown;
}

export interface Placement extends PlacementRef {
  exercise: string;
}

export interface RustMeta {
  slug: string;
  kind: 'lib' | 'bin';
  edition: string;
  testEdition: string;
  argv: boolean;
  testShape: 'lib' | 'main';
  deps: { name: string; version: string }[];
  placements: PlacementRef[];
}

export interface Exercise {
  language: Language;
  slug: string;
  title: string;
  /** rust: lib|bin; go: func|prog; js: func. */
  kind: string;
  argv: boolean;
  readme: string;
  placements: PlacementRef[];
  /** Files the platform grades. */
  expectedFiles: string[];
  /** Files the student edits, in display order. */
  editorFiles: string[];
  /** Starter content per editor file. */
  starter: Record<string, string>;
  /** Never sent to the browser. */
  test: string | null;
  /** The raw meta.json, for language-specific runner needs. */
  meta: Record<string, unknown>;
}

type IndexFile = {
  exercises?: ({ slug: string; dir?: string } & Record<string, unknown>)[];
  placements?: Placement[];
};

const catalogue = new Map<Language, Map<string, Exercise>>();
const placementsByLang = new Map<Language, Placement[]>();
/** One-line hints per exercise (D4), from content/<lang>/hints.json. */
const hintsByLang = new Map<Language, Record<string, string>>();

function readIf(path: string): string | null {
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
}

function loadRust(dir: string, slug: string, meta: Record<string, unknown>): Exercise {
  const m = meta as unknown as RustMeta;
  const starter = readFileSync(join(dir, 'starter.rs'), 'utf8');
  const mainRs = readIf(join(dir, 'main.rs')) ?? '';
  const isLib = m.kind === 'lib';
  return {
    language: 'rust',
    slug,
    title: slug,
    kind: m.kind,
    argv: Boolean(m.argv),
    readme: readFileSync(join(dir, 'README.md'), 'utf8'),
    placements: m.placements ?? [],
    expectedFiles: isLib ? ['src/lib.rs'] : ['src/main.rs'],
    editorFiles: isLib ? ['src/lib.rs', 'src/main.rs'] : ['src/main.rs'],
    starter: isLib ? { 'src/lib.rs': starter, 'src/main.rs': mainRs } : { 'src/main.rs': starter },
    test: readIf(join(dir, 'test.rs')),
    meta,
  };
}

function loadGeneric(language: Language, dir: string, slug: string, meta: Record<string, unknown>): Exercise {
  const ext = SOURCE_EXT[language];
  const files = (meta.files ?? {}) as { subject?: string; starter?: string; main?: string | null; test?: string };
  const expectedFiles = Array.isArray(meta.expectedFiles) ? (meta.expectedFiles as string[]) : [`${slug}.${ext}`];
  const editorFiles = Array.isArray(meta.editorFiles) ? (meta.editorFiles as string[]) : expectedFiles;

  const starterSrc = readFileSync(join(dir, files.starter ?? `starter.${ext}`), 'utf8');
  const mainSrc = files.main === null ? null : readIf(join(dir, files.main ?? `main.${ext}`));

  const starter: Record<string, string> = {};
  for (const f of editorFiles) {
    if (f === expectedFiles[0]) starter[f] = starterSrc;
    else if (basename(f) === `main.${ext}` && mainSrc !== null) starter[f] = mainSrc;
    else starter[f] = '';
  }

  return {
    language,
    slug,
    title: typeof meta.title === 'string' ? meta.title : slug,
    kind: typeof meta.kind === 'string' ? meta.kind : 'func',
    argv: Boolean(meta.argv),
    readme: readFileSync(join(dir, files.subject ?? 'README.md'), 'utf8'),
    placements: Array.isArray(meta.placements) ? (meta.placements as PlacementRef[]) : [],
    expectedFiles,
    editorFiles,
    starter,
    test: readIf(join(dir, files.test ?? `test.${ext}`)),
    meta,
  };
}

/**
 * Java (D33): one starter file per public type, ExerciseRunner.java for Run,
 * and the official test under test/ (V3 step 7, docs/01_design/07_java_track.md §3).
 */
function loadJava(dir: string, slug: string, meta: Record<string, unknown>): Exercise {
  const expectedFiles = meta.expectedFiles as string[];
  const editorFiles = Array.isArray(meta.editorFiles) ? (meta.editorFiles as string[]) : [...expectedFiles, 'ExerciseRunner.java'];
  const starter: Record<string, string> = {};
  for (const f of editorFiles) starter[f] = readIf(join(dir, f)) ?? '';
  const className = (meta.test as { className?: string } | undefined)?.className ?? slug;
  return {
    language: 'java',
    slug,
    title: typeof meta.title === 'string' ? meta.title : slug,
    kind: 'class',
    argv: false,
    readme: readFileSync(join(dir, 'README.md'), 'utf8'),
    placements: Array.isArray(meta.placements) ? (meta.placements as PlacementRef[]) : [],
    expectedFiles,
    editorFiles,
    starter,
    test: readIf(join(dir, 'test', `${className}_test.java`)),
    meta,
  };
}

/** (Re)load every language. Exported so tests can point CONTENT_DIR elsewhere. */
export function loadContent(root = config.contentDir): void {
  catalogue.clear();
  placementsByLang.clear();
  hintsByLang.clear();

  for (const language of LANGUAGES) {
    const langDir = join(root, language);
    const exercises = new Map<string, Exercise>();
    catalogue.set(language, exercises);
    placementsByLang.set(language, []);

    if (!existsSync(langDir)) {
      logger.warn('content.language_missing', { language, dir: langDir });
      continue;
    }

    let index: IndexFile = {};
    const indexPath = join(langDir, 'index.json');
    if (existsSync(indexPath)) {
      try {
        index = JSON.parse(readFileSync(indexPath, 'utf8')) as IndexFile;
      } catch (err) {
        logger.error('content.index_unreadable', { language, error: String(err) });
      }
    } else {
      logger.warn('content.index_missing', { language });
    }

    const exDir = join(langDir, 'exercises');
    const entries =
      index.exercises?.map((e) => ({ slug: e.slug, dir: e.dir ? join(langDir, e.dir) : join(exDir, e.slug) })) ??
      (existsSync(exDir)
        ? readdirSync(exDir, { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => ({ slug: d.name, dir: join(exDir, d.name) }))
        : []);

    for (const { slug, dir } of entries) {
      if (!SLUG_PATTERN.test(slug)) {
        logger.warn('content.bad_slug', { language, slug });
        continue;
      }
      try {
        const metaPath = join(dir, 'meta.json');
        const meta = existsSync(metaPath)
          ? (JSON.parse(readFileSync(metaPath, 'utf8')) as Record<string, unknown>)
          : // Rust index.json carries meta inline.
            ((index.exercises?.find((e) => e.slug === slug) ?? {}) as Record<string, unknown>);
        const ex =
          language === 'rust' ? loadRust(dir, slug, meta) : language === 'java' ? loadJava(dir, slug, meta) : loadGeneric(language, dir, slug, meta);
        exercises.set(slug, ex);
      } catch (err) {
        logger.error('content.exercise_skipped', { language, slug, error: String(err) });
      }
    }

    // Placements: index.json's list when present, otherwise rebuilt from meta.
    const placements: Placement[] = index.placements
      ? index.placements.filter((p) => exercises.has(p.exercise))
      : [...exercises.values()].flatMap((e) => e.placements.map((p) => ({ ...p, exercise: e.slug })));
    placementsByLang.set(language, placements);

    const hintsPath = join(langDir, 'hints.json');
    if (existsSync(hintsPath)) {
      try {
        const raw = JSON.parse(readFileSync(hintsPath, 'utf8')) as Record<string, unknown>;
        hintsByLang.set(language, Object.fromEntries(Object.entries(raw).filter(([k, v]) => exercises.has(k) && typeof v === 'string')) as Record<string, string>);
      } catch (err) {
        logger.error('content.hints_unreadable', { language, error: String(err) });
      }
    }

    logger.info('content.loaded', { language, exercises: exercises.size, placements: placements.length });
  }
}

loadContent();

export function hintFor(language: Language, slug: string): string | null {
  return hintsByLang.get(language)?.[slug] ?? null;
}

export function placementsFor(language: Language): Placement[] {
  return placementsByLang.get(language) ?? [];
}

export function listExercises(language: Language): { slug: string; title: string; kind: string; argv: boolean; language: Language }[] {
  return [...(catalogue.get(language)?.values() ?? [])].map((e) => ({
    language: e.language,
    slug: e.slug,
    title: e.title,
    kind: e.kind,
    argv: e.argv,
  }));
}

export function getExercise(language: Language, slug: string): Exercise | undefined {
  return catalogue.get(language)?.get(slug);
}

/** The browser-safe view of an exercise: no test, no solution. */
export function publicView(ex: Exercise) {
  return {
    language: ex.language,
    slug: ex.slug,
    title: ex.title,
    kind: ex.kind,
    argv: ex.argv,
    readme: ex.readme,
    // Weights stay on the server (D35); routes add each placement's value.
    placements: ex.placements.map(({ baseXp: _w, ...p }) => p),
    expectedFiles: ex.expectedFiles,
    editorFiles: ex.editorFiles,
    allowedFunctions: Array.isArray(ex.meta.allowedFunctions) ? ex.meta.allowedFunctions : undefined,
    // Go lint input: the package the graded files must declare.
    studentPackage: typeof ex.meta.studentPackage === 'string' ? ex.meta.studentPackage : undefined,
    // JS lint input: top-level names the test declares.
    reservedNames: Array.isArray(ex.meta.reservedNames) ? ex.meta.reservedNames : undefined,
  };
}

/**
 * Keep only editor files with string bodies under the size cap. Returns null if
 * the body names a file the student may not write.
 */
export function pickEditorFiles(ex: Exercise, raw: unknown, maxBytes = 512 * 1024): Record<string, string> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!ex.editorFiles.includes(k) || typeof v !== 'string' || Buffer.byteLength(v) > maxBytes) return null;
    out[k] = v;
  }
  return out;
}

/** Starter overlaid with whatever the student has saved. */
export function workingFiles(ex: Exercise, saved: Record<string, string> | null | undefined): Record<string, string> {
  return { ...ex.starter, ...(saved ?? {}) };
}

// ── Rust materialisation (kept from the reference for the Rust runner) ───────

function manifest(name: string, edition: string, deps: RustMeta['deps'], pathDep?: string): string {
  const lines = ['[package]', `name = "${name}"`, 'version = "0.1.0"', `edition = "${edition}"`, '', '[dependencies]'];
  if (pathDep) lines.push(`${pathDep} = { path = "../${pathDep}" }`);
  for (const d of deps) lines.push(`${d.name} = "${d.version}"`);
  return `${lines.join('\n')}\n`;
}

/**
 * Files to write into a Rust container for one exercise. The test crate is
 * included on EVERY materialise, straight from content/, so a student cannot
 * weaken the assertions. <slug>/ and <slug>_test/ must stay siblings.
 */
export function materialiseRustFiles(ex: Exercise, files: Record<string, string>): { path: string; content: string }[] {
  const m = ex.meta as unknown as RustMeta;
  const work = workingFiles(ex, files);
  const out: { path: string; content: string }[] = [
    { path: `${ex.slug}/Cargo.toml`, content: manifest(ex.slug, m.edition, []) },
    {
      path: `${ex.slug}_test/Cargo.toml`,
      content: manifest(`${ex.slug}_test`, m.testEdition, m.deps ?? [], m.kind === 'lib' ? ex.slug : undefined),
    },
    { path: `${ex.slug}_test/src/${m.testShape === 'lib' ? 'lib.rs' : 'main.rs'}`, content: ex.test ?? '' },
  ];
  for (const f of ex.editorFiles) out.push({ path: `${ex.slug}/${f}`, content: work[f] ?? '' });
  return out;
}

// ── Runner input (shared by the run routes and tools/parity.ts) ──────────────

/** What the runner receives for each language, given the student's working files. */
export function filesForRunner(ex: Exercise, files: Record<string, string>, mode: 'run' | 'test'): Record<string, string> {
  if (ex.language === 'rust') {
    return Object.fromEntries(materialiseRustFiles(ex, files).map((f) => [f.path, f.content]));
  }
  if (ex.language === 'go') {
    // Submit sends only the graded files. Run sends both, but a function
    // exercise's demo is `package main` and cannot share a directory with the
    // graded package, so it goes in ./demo (Go reference behaviour).
    if (mode === 'test') return Object.fromEntries(Object.entries(files).filter(([k]) => ex.expectedFiles.includes(k)));
    const pkg = ex.meta.studentPackage;
    return Object.fromEntries(
      Object.entries(files).map(([k, v]) => [k === 'main.go' && pkg !== 'main' ? 'demo/main.go' : k, v]),
    );
  }
  return files;
}

/** Exercise facts the Go, JS and Java runner entrypoints need. */
export function runnerExerciseMeta(ex: Exercise): { expectedFiles: string[]; editorFiles: string[]; allowedFunctions?: string[]; className?: string } {
  return {
    expectedFiles: ex.expectedFiles,
    editorFiles: ex.editorFiles,
    allowedFunctions: Array.isArray(ex.meta.allowedFunctions) ? (ex.meta.allowedFunctions as string[]) : undefined,
    className: ex.language === 'java' ? (ex.meta.test as { className?: string } | undefined)?.className : undefined,
  };
}
