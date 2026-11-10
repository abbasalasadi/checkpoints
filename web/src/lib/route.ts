/**
 * The selected track and exercise live in the URL.
 *
 * Held only in React state, they were lost on refresh and Back left the
 * application entirely. In the path they survive reload, work with Back and
 * Forward, and can be linked to or bookmarked.
 *
 *   /                    the dashboard (V2): tracks, resume, recent activity
 *   /history             the history explorer (V2)
 *   /vault               the solutions vault (V2)
 *   /exams               mock exams: start, reports (V3)
 *   /admin               admin view, admins only (V5): Usage tab, ?range=
 *   /admin/students      admin Students tab; /admin/students/<name> opens a summary
 *   /admin/server        admin Server tab
 *   /go                  the Go track, no exercise
 *   /go/hello            that Go exercise
 *   /go/hello?cp=2       the same exercise, opened from checkpoint 2 (V4):
 *                        progress is shared, the value shown is that checkpoint's
 *   /e/min_and_max       legacy Rust link — read as /rust/min_and_max and
 *                        rewritten in place
 */
import type { Language } from './api.js';

export const LANGUAGES: readonly Language[] = ['go', 'js', 'rust', 'java'];

/** A page that is not a track: the dashboard or the history explorer. */
export type Page = 'dashboard' | 'history' | 'vault' | 'exams' | 'admin';

export interface Location {
  /** Set when the path is a page rather than a track. */
  page: Page | null;
  language: Language | null;
  slug: string | null;
  /** The checkpoint the exercise was opened from (`?cp=`), or null. */
  checkpoint: string | null;
  /** The path was a legacy shape and should be replaced with pathFor(). */
  legacy: boolean;
}

// Same character class the APIs accept (Go and JS slugs use hyphens), so a
// hand-typed URL cannot put anything odd into a request path.
const SLUG = /^[a-z0-9][a-z0-9_-]*$/;

export function isLanguage(v: unknown): v is Language {
  return typeof v === 'string' && (LANGUAGES as readonly string[]).includes(v);
}

function cleanSlug(raw: string | undefined): string | null {
  if (!raw) return null;
  let slug: string;
  try {
    slug = decodeURIComponent(raw);
  } catch {
    return null;
  }
  return SLUG.test(slug) ? slug : null;
}

const CHECKPOINT = /^[a-z0-9]{1,16}$/;
function cleanCheckpoint(search: string): string | null {
  const cp = new URLSearchParams(search).get('cp');
  return cp && CHECKPOINT.test(cp) ? cp : null;
}

export function parsePath(pathname: string, search = ''): Location {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const [first, second, ...rest] = parts;
  const home: Location = { page: 'dashboard', language: null, slug: null, checkpoint: null, legacy: false };
  if (first === 'history' && second === undefined) return { ...home, page: 'history' };
  if (first === 'vault' && second === undefined) return { ...home, page: 'vault' };
  if (first === 'exams' && second === undefined) return { ...home, page: 'exams' };
  if (first === 'admin' && rest.length <= 1) return { ...home, page: 'admin' };
  if (first === 'e') {
    const slug = rest.length ? null : cleanSlug(second);
    return slug ? { page: null, language: 'rust', slug, checkpoint: null, legacy: true } : home;
  }
  if (isLanguage(first)) {
    if (second === undefined) return { page: null, language: first, slug: null, checkpoint: null, legacy: false };
    const slug = rest.length ? null : cleanSlug(second);
    return { page: null, language: first, slug, checkpoint: slug ? cleanCheckpoint(search) : null, legacy: false };
  }
  return home;
}

export function readLocation(): Location {
  return parsePath(window.location.pathname, window.location.search);
}

/** The slug in the current URL, or null. */
export function slugFromLocation(): string | null {
  return readLocation().slug;
}

export function pathFor(language: Language | null, slug: string | null = null, checkpoint: string | null = null): string {
  if (!language) return '/';
  if (!slug) return `/${language}`;
  return checkpoint ? `/${language}/${slug}?cp=${encodeURIComponent(checkpoint)}` : `/${language}/${slug}`;
}

/**
 * Navigate without reloading.
 *
 * `replace` is for corrections — an unknown slug, a legacy path — which should
 * not leave a broken entry in the history for Back to return to.
 */
export function navigate(language: Language | null, slug: string | null, { replace = false, checkpoint = null }: { replace?: boolean; checkpoint?: string | null } = {}): void {
  const next = pathFor(language, slug, checkpoint);
  if (next === window.location.pathname + window.location.search) return;
  if (replace) window.history.replaceState({ language, slug }, '', next);
  else window.history.pushState({ language, slug }, '', next);
}

/** Go to a page (dashboard or history). */
export function navigatePage(page: Page, { replace = false } = {}): void {
  const next = page === 'dashboard' ? '/' : `/${page}`;
  if (next === window.location.pathname) return;
  if (replace) window.history.replaceState({ page }, '', next);
  else window.history.pushState({ page }, '', next);
  window.dispatchEvent(new Event(LOCATION_CHANGE));
}

/** Fired after navigatePage, for views that read their own sub-path (admin). */
export const LOCATION_CHANGE = 'checkpoints:locationchange';

/** Subscribe to Back and Forward. Returns an unsubscribe. */
export function onNavigate(handler: (loc: Location) => void): () => void {
  const listener = () => handler(readLocation());
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
