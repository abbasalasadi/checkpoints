/**
 * Keyboard shortcuts (V3 feature 3). One table drives both the key handler and
 * the shortcut sheet, so the sheet cannot drift from what the keys do. Keys
 * the editor already owns (Ctrl+Z, Ctrl+/, Alt+↑, Ctrl+Shift+Z…) are avoided.
 */

export type ShortcutId = 'palette' | 'run' | 'submit' | 'save' | 'format' | 'focus' | 'sheet';

export interface Shortcut {
  id: ShortcutId;
  /** Shown in the sheet and the palette; "Mod" is Ctrl, or ⌘ on a Mac. */
  keys: string;
  label: string;
  match: (e: Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>) => boolean;
}

const mod = (e: { ctrlKey: boolean; metaKey: boolean }) => e.ctrlKey || e.metaKey;

export const SHORTCUTS: Shortcut[] = [
  { id: 'palette', keys: 'Mod+K', label: 'Command palette', match: (e) => mod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k' },
  { id: 'run', keys: 'Mod+Enter', label: 'Run', match: (e) => mod(e) && !e.shiftKey && !e.altKey && e.key === 'Enter' },
  { id: 'submit', keys: 'Mod+Shift+Enter', label: 'Submit', match: (e) => mod(e) && e.shiftKey && !e.altKey && e.key === 'Enter' },
  { id: 'save', keys: 'Mod+S', label: 'Save now', match: (e) => mod(e) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 's' },
  { id: 'format', keys: 'Shift+Alt+F', label: 'Format (Go)', match: (e) => !mod(e) && e.shiftKey && e.altKey && e.key.toLowerCase() === 'f' },
  { id: 'focus', keys: 'Mod+Shift+F', label: 'Focus mode on/off', match: (e) => mod(e) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f' },
  { id: 'sheet', keys: 'Mod+Shift+/', label: 'Keyboard shortcuts', match: (e) => mod(e) && e.shiftKey && !e.altKey && (e.key === '?' || e.key === '/') },
];

export function matchShortcut(e: Parameters<Shortcut['match']>[0]): ShortcutId | null {
  return SHORTCUTS.find((s) => s.match(e))?.id ?? null;
}

const MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform ?? '');

/** "Mod+Shift+Enter" -> "Ctrl+Shift+Enter", or "⌘⇧Enter" on a Mac. */
export function keyLabel(keys: string, mac = MAC): string {
  if (!mac) return keys.replace('Mod', 'Ctrl');
  return keys.replace('Mod+', '⌘').replace('Shift+', '⇧').replace('Alt+', '⌥');
}

export function keysFor(id: ShortcutId): string {
  return keyLabel(SHORTCUTS.find((s) => s.id === id)!.keys);
}

/** Every word of the query appears in the label, in any order. */
export function matchesQuery(label: string, query: string): boolean {
  const l = label.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => l.includes(w));
}
