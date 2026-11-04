/**
 * URL routing tests.
 *
 * A refresh or a shared link must reopen the same track and exercise, old Rust
 * links must keep working, and a hand-typed path must not smuggle anything
 * into a request.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { parsePath, pathFor, readLocation, slugFromLocation } from '../src/lib/route.js';

function at(path: string) {
  window.history.replaceState({}, '', path);
}

beforeEach(() => at('/'));

describe('reading the location', () => {
  test('the root selects no track (it is the dashboard)', () => {
    expect(readLocation()).toEqual({ page: 'dashboard', language: null, slug: null, checkpoint: null, legacy: false });
  });

  test.each([
    ['/go/hello', 'go', 'hello'],
    ['/js/is-positive', 'js', 'is-positive'],
    ['/rust/min_and_max', 'rust', 'min_and_max'],
    ['/rust/min_and_max/', 'rust', 'min_and_max'],
  ])('%s yields %s / %s', (path, language, slug) => {
    at(path);
    expect(readLocation()).toMatchObject({ language, slug, legacy: false });
    expect(slugFromLocation()).toBe(slug);
  });

  test('a bare track selects the track only', () => {
    expect(parsePath('/go')).toEqual({ page: null, language: 'go', slug: null, checkpoint: null, legacy: false });
  });

  test('a legacy /e/ path is read as Rust and flagged for rewriting', () => {
    expect(parsePath('/e/min_and_max')).toEqual({ page: null, language: 'rust', slug: 'min_and_max', checkpoint: null, legacy: true });
  });

  test('an unrelated path selects nothing rather than guessing', () => {
    expect(parsePath('/something/else')).toMatchObject({ language: null, slug: null });
  });

  test('the root is the dashboard and /history the history explorer (V2)', () => {
    expect(parsePath('/')).toMatchObject({ page: 'dashboard', language: null });
    expect(parsePath('/history')).toMatchObject({ page: 'history', language: null });
    expect(parsePath('/history/x')).toMatchObject({ page: 'dashboard', language: null });
  });
});

describe('rejecting anything that is not a slug', () => {
  test.each([
    ['/rust/../../etc/passwd', 'traversal'],
    ['/rust/Min_And_Max', 'wrong case'],
    ['/go/min%20and%20max', 'space'],
    ['/go/a/b', 'extra segment'],
    ['/e/', 'empty legacy'],
    ['/go/%E0%A4%A', 'bad escape'],
  ])('%s is refused (%s)', (path) => {
    expect(parsePath(path).slug).toBeNull();
  });
});

describe('building paths', () => {
  test('a slug becomes a track path', () => {
    expect(pathFor('rust', 'reverse_it')).toBe('/rust/reverse_it');
    expect(pathFor('go', 'hello')).toBe('/go/hello');
  });

  test('a track alone, and no selection', () => {
    expect(pathFor('js', null)).toBe('/js');
    expect(pathFor(null, null)).toBe('/');
  });
});

describe('the solutions vault route (V2)', () => {
  test('/vault is its own page', () => {
    expect(parsePath('/vault')).toMatchObject({ page: 'vault', language: null });
  });
});

describe('the mock exams route (V3)', () => {
  test('/exams is its own page', () => {
    expect(parsePath('/exams')).toMatchObject({ page: 'exams', language: null });
  });
});

describe('checkpoint in the URL (V4)', () => {
  test('reads ?cp= on an exercise and writes it back', () => {
    expect(parsePath('/go/digitlen', '?cp=2')).toMatchObject({ language: 'go', slug: 'digitlen', checkpoint: '2' });
    expect(parsePath('/go/digitlen', '?cp=../x').checkpoint).toBeNull();
    expect(parsePath('/go', '?cp=2').checkpoint).toBeNull();
    expect(pathFor('go', 'digitlen', 'retest')).toBe('/go/digitlen?cp=retest');
    expect(pathFor('go', 'digitlen')).toBe('/go/digitlen');
  });
});
