/**
 * URL routing tests.
 *
 * The behaviour that matters: a refresh or a shared link must reopen the same
 * exercise, and a hand-typed path must not smuggle anything into a request.
 */

import { beforeEach, describe, expect, test } from 'vitest';
import { pathFor, slugFromLocation } from '../src/lib/route.js';

function at(path: string) {
  window.history.replaceState({}, '', path);
}

beforeEach(() => at('/'));

describe('reading the exercise from the URL', () => {
  test('the root selects nothing', () => {
    expect(slugFromLocation()).toBeNull();
  });

  test('an exercise path yields its slug', () => {
    at('/e/min_and_max');
    expect(slugFromLocation()).toBe('min_and_max');
  });

  test('a trailing slash is tolerated', () => {
    at('/e/min_and_max/');
    expect(slugFromLocation()).toBe('min_and_max');
  });

  test('an unrelated path selects nothing rather than guessing', () => {
    at('/something/else');
    expect(slugFromLocation()).toBeNull();
  });
});

describe('rejecting anything that is not a slug', () => {
  // Slugs are [a-z0-9_], the same class the API accepts. A hand-typed path must
  // not be able to put path traversal or a query into a request URL.
  test.each([
    ['/e/../../etc/passwd', 'traversal'],
    ['/e/Min_And_Max', 'wrong case'],
    ['/e/min-and-max', 'hyphen'],
    ['/e/min%20and%20max', 'space'],
    ['/e/', 'empty'],
  ])('%s is refused (%s)', (path) => {
    at(path);
    expect(slugFromLocation()).toBeNull();
  });
});

describe('building paths', () => {
  test('a slug becomes an exercise path', () => {
    expect(pathFor('reverse_it')).toBe('/e/reverse_it');
  });

  test('no selection is the root', () => {
    expect(pathFor(null)).toBe('/');
  });
});
