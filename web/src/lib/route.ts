/**
 * The selected track and exercise live in the URL.
 *
 * Held only in React state, they were lost on refresh and Back left the
 * application entirely. In the path they survive reload, work with Back and
 * Forward, and can be linked to or bookmarked.
 *
 *   /                    nothing selected (the last track, or Rust)
 *   /go                  the Go track, no exercise
 *   /go/hello            that Go exercise
 *   /e/min_and_max       legacy Rust link — read as /rust/min_and_max and
 *                        rewritten in place
 */
import type { Language } from './api.js';

export const LANGUAGES: readonly Language[] = ['go', 'js', 'rust'];

export interface Location {
  language: Language | null;
  slug: string | null;
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

export function parsePath(pathname: string): Location {
  const parts = pathname.replace(/\/+$/, '').split('/').filter(Boolean);
  const [first, second, ...rest] = parts;
  if (first === 'e') {
    const slug = rest.length ? null : cleanSlug(second);
    return slug ? { language: 'rust', slug, legacy: true } : { language: null, slug: null, legacy: false };
  }
  if (isLanguage(first)) {
    if (second === undefined) return { language: first, slug: null, legacy: false };
    const slug = rest.length ? null : cleanSlug(second);
    return { language: first, slug, legacy: false };
  }
  return { language: null, slug: null, legacy: false };
}

export function readLocation(): Location {
  return parsePath(window.location.pathname);
}

/** The slug in the current URL, or null. */
export function slugFromLocation(): string | null {
  return readLocation().slug;
}

export function pathFor(language: Language | null, slug: string | null = null): string {
  if (!language) return '/';
  return slug ? `/${language}/${slug}` : `/${language}`;
}

/**
 * Navigate without reloading.
 *
 * `replace` is for corrections — an unknown slug, a legacy path — which should
 * not leave a broken entry in the history for Back to return to.
 */
export function navigate(language: Language | null, slug: string | null, { replace = false } = {}): void {
  const next = pathFor(language, slug);
  if (next === window.location.pathname) return;
  if (replace) window.history.replaceState({ language, slug }, '', next);
  else window.history.pushState({ language, slug }, '', next);
}

/** Subscribe to Back and Forward. Returns an unsubscribe. */
export function onNavigate(handler: (loc: Location) => void): () => void {
  const listener = () => handler(readLocation());
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
