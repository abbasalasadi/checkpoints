/**
 * The selected exercise lives in the URL.
 *
 * Held only in React state, it was lost on refresh and Back left the
 * application entirely. In the path it survives reload, works with Back and
 * Forward, and can be linked to or bookmarked.
 *
 * Path shape rather than a query string, so nginx's `try_files … /index.html`
 * and Vite's SPA fallback both serve the app without extra configuration.
 *
 *   /                  nothing selected
 *   /e/min_and_max     that exercise
 */

const PREFIX = '/e/';

/** The slug in the current URL, or null. Unknown shapes read as no selection. */
export function slugFromLocation(): string | null {
  const path = window.location.pathname;
  if (!path.startsWith(PREFIX)) return null;
  const slug = decodeURIComponent(path.slice(PREFIX.length)).replace(/\/+$/, '');
  // Same character class the API accepts, so a hand-typed URL cannot put
  // anything odd into a request path.
  return /^[a-z0-9_]+$/.test(slug) ? slug : null;
}

export function pathFor(slug: string | null): string {
  return slug ? `${PREFIX}${slug}` : '/';
}

/**
 * Navigate without reloading.
 *
 * `replace` is for corrections — an unknown slug, say — which should not leave
 * a broken entry in the history for Back to return to.
 */
export function navigate(slug: string | null, { replace = false } = {}): void {
  const next = pathFor(slug);
  if (next === window.location.pathname) return;
  if (replace) window.history.replaceState({ slug }, '', next);
  else window.history.pushState({ slug }, '', next);
}

/** Subscribe to Back and Forward. Returns an unsubscribe. */
export function onNavigate(handler: (slug: string | null) => void): () => void {
  const listener = () => handler(slugFromLocation());
  window.addEventListener('popstate', listener);
  return () => window.removeEventListener('popstate', listener);
}
