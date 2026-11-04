/**
 * Account preferences (V2 feature 4, D24). One validated shape: unknown keys
 * are dropped and bad values fall back to the default, so a stale or tampered
 * client can never store something the editor cannot apply.
 */

export interface Preferences {
  theme: 'dark' | 'light';
  fontSize: number;
  tabSize: 2 | 4 | 8;
  wordWrap: boolean;
  keybindings: 'default' | 'vim';
}

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  fontSize: 13,
  tabSize: 4,
  wordWrap: false,
  keybindings: 'default',
};

export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;

/** Merge `input` over `base`, keeping only valid values. */
export function normalizePreferences(input: unknown, base: Preferences = DEFAULT_PREFERENCES): Preferences {
  const out: Preferences = { ...base };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return out;
  const v = input as Record<string, unknown>;
  if (v.theme === 'dark' || v.theme === 'light') out.theme = v.theme;
  if (typeof v.fontSize === 'number' && Number.isInteger(v.fontSize) && v.fontSize >= FONT_SIZE_MIN && v.fontSize <= FONT_SIZE_MAX) {
    out.fontSize = v.fontSize;
  }
  if (v.tabSize === 2 || v.tabSize === 4 || v.tabSize === 8) out.tabSize = v.tabSize;
  if (typeof v.wordWrap === 'boolean') out.wordWrap = v.wordWrap;
  if (v.keybindings === 'default' || v.keybindings === 'vim') out.keybindings = v.keybindings;
  return out;
}
