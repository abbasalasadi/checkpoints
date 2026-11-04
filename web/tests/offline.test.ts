import { beforeEach, describe, expect, test } from 'vitest';
import { clearDraft, draftDiffers, readDraft, saveDraft } from '../src/lib/offline.js';

beforeEach(() => localStorage.clear());

describe('browser drafts (V2 offline)', () => {
  test('a saved draft reads back, per track and exercise', () => {
    saveDraft('go', 'gcd', { 'gcd.go': 'x' });
    expect(readDraft('go', 'gcd')).toEqual({ 'gcd.go': 'x' });
    expect(readDraft('rust', 'gcd')).toBeNull();
    clearDraft('go', 'gcd');
    expect(readDraft('go', 'gcd')).toBeNull();
  });

  test('a corrupt draft is ignored', () => {
    localStorage.setItem('cp.draft.go.gcd', '{"files":{"a":1}}');
    expect(readDraft('go', 'gcd')).toBeNull();
    localStorage.setItem('cp.draft.go.gcd', 'not json');
    expect(readDraft('go', 'gcd')).toBeNull();
  });

  test('only a real difference on a known file counts', () => {
    expect(draftDiffers({ a: '1' }, { a: '1' })).toBe(false);
    expect(draftDiffers({ a: '2' }, { a: '1' })).toBe(true);
    expect(draftDiffers({ z: '2' }, { a: '1' })).toBe(false);
  });
});
