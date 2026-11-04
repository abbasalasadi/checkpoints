/**
 * Account preferences (V2 feature 4, D24).
 *
 * The account copy on the server is the truth. A copy in localStorage only
 * avoids a flash of the wrong theme before the first fetch returns; it is a
 * per-browser convenience and may be missing.
 */
import { useCallback, useEffect, useState } from 'react';
import { api, type Preferences } from './api.js';
import { logger } from '../logger.js';

export type { Preferences };

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'dark',
  fontSize: 13,
  tabSize: 4,
  wordWrap: false,
  keybindings: 'default',
};
export const FONT_SIZE_MIN = 10;
export const FONT_SIZE_MAX = 24;

const CACHE_KEY = 'cp.preferences';

function cached(): Preferences {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) return { ...DEFAULT_PREFERENCES, ...(JSON.parse(raw) as Partial<Preferences>) };
  } catch {
    /* storage blocked or corrupt: defaults */
  }
  return DEFAULT_PREFERENCES;
}

function remember(p: Preferences): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the server copy still holds it */
  }
}

/** Theme lives on <html data-theme>, so every token in styles.css follows it. */
export function applyTheme(theme: Preferences['theme']): void {
  document.documentElement.dataset.theme = theme;
}

/** Load once signed in; `update` applies at once and saves in the background. */
export function usePreferences(signedIn: boolean) {
  const [prefs, setPrefs] = useState<Preferences>(cached);

  useEffect(() => applyTheme(prefs.theme), [prefs.theme]);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    api
      .preferences()
      .then(({ preferences }) => {
        if (!live) return;
        setPrefs(preferences);
        remember(preferences);
      })
      .catch((err) => logger.warn('preferences.load_failed', { error: String(err) }));
    return () => {
      live = false;
    };
  }, [signedIn]);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPrefs((p) => {
      const next = { ...p, ...patch };
      remember(next);
      return next;
    });
    // The reply is not applied: a slow reply to an earlier change would undo a
    // later one. The server only drops invalid values, which the UI never sends.
    api
      .savePreferences(patch)
      .catch((err) => logger.warn('preferences.save_failed', { error: String(err) }));
  }, []);

  return { prefs, update };
}
