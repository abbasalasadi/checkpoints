/**
 * Shortcuts (V3): each key combination maps to one action, none collides, and
 * the palette search matches words in any order.
 */
import { describe, expect, test } from 'vitest';
import { keyLabel, matchesQuery, matchShortcut, SHORTCUTS } from '../src/lib/shortcuts.js';

const k = (key: string, o: Partial<{ ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }> = {}) => ({
  key, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...o,
});

describe('shortcuts', () => {
  test('map to their actions, with Ctrl or Cmd', () => {
    expect(matchShortcut(k('k', { ctrlKey: true }))).toBe('palette');
    expect(matchShortcut(k('Enter', { metaKey: true }))).toBe('run');
    expect(matchShortcut(k('Enter', { ctrlKey: true, shiftKey: true }))).toBe('submit');
    expect(matchShortcut(k('F', { shiftKey: true, altKey: true }))).toBe('format');
    expect(matchShortcut(k('F', { ctrlKey: true, shiftKey: true }))).toBe('focus');
    expect(matchShortcut(k('?', { ctrlKey: true, shiftKey: true }))).toBe('sheet');
  });

  test('plain typing and editor keys are left alone', () => {
    expect(matchShortcut(k('k'))).toBeNull();
    expect(matchShortcut(k('Enter'))).toBeNull();
    expect(matchShortcut(k('z', { ctrlKey: true }))).toBeNull();
    expect(matchShortcut(k('/', { ctrlKey: true }))).toBeNull();
  });

  test('no two shortcuts share keys', () => {
    expect(new Set(SHORTCUTS.map((s) => s.keys)).size).toBe(SHORTCUTS.length);
  });

  test('labels per platform', () => {
    expect(keyLabel('Mod+Shift+Enter', false)).toBe('Ctrl+Shift+Enter');
    expect(keyLabel('Mod+Shift+Enter', true)).toBe('⌘⇧Enter');
  });
});

test('palette search matches words in any order', () => {
  expect(matchesQuery('Open exercise: is-positive', 'pos open')).toBe(true);
  expect(matchesQuery('Run', 'sub')).toBe(false);
  expect(matchesQuery('Run', '')).toBe(true);
});
