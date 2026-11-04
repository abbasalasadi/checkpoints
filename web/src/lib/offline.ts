/**
 * V2 offline support: an online flag, and a browser copy of unsaved edits so a
 * dropped connection or a closed tab cannot lose them. The server copy stays
 * the source of truth; the browser copy is only a draft waiting to be sent.
 */
import { useEffect, useState } from 'react';
import type { Language } from './api.js';

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return online;
}

const key = (language: Language, slug: string) => `cp.draft.${language}.${slug}`;

export function saveDraft(language: Language, slug: string, files: Record<string, string>): void {
  try {
    localStorage.setItem(key(language, slug), JSON.stringify({ files, at: Date.now() }));
  } catch {
    /* storage full or blocked: the server save still runs */
  }
}

export function readDraft(language: Language, slug: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(key(language, slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { files?: unknown };
    const files = parsed.files;
    if (!files || typeof files !== 'object' || Array.isArray(files)) return null;
    return Object.values(files).every((v) => typeof v === 'string') ? (files as Record<string, string>) : null;
  } catch {
    return null;
  }
}

export function clearDraft(language: Language, slug: string): void {
  try {
    localStorage.removeItem(key(language, slug));
  } catch {
    /* nothing to clear */
  }
}

/** True when the draft holds something the server copy does not. */
export function draftDiffers(draft: Record<string, string>, server: Record<string, string>): boolean {
  return Object.entries(draft).some(([f, v]) => f in server && server[f] !== v);
}
