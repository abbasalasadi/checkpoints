/**
 * Renderers for the instruction markdown.
 *
 * Two upstream realities to handle:
 *   - READMEs link out to doc.rust-lang.org and friends. Following one in the
 *     same tab throws away the student's editor state, so external links open
 *     in a new tab.
 *   - Two READMEs reference diagram files (`Insertion-Sort-demo.png`,
 *     `determinant-of-a-3x3-matrix-formula-3.png`) that were never shipped with
 *     the exercises. A broken-image icon in the middle of the instructions looks
 *     like our bug; a plain note is honest and unobtrusive.
 */

import type { Components } from 'react-markdown';

/** Anything with a scheme or protocol-relative prefix leaves the application. */
function isExternal(href: string | undefined): boolean {
  return !!href && /^(https?:)?\/\//i.test(href);
}

export const markdownComponents: Components = {
  a({ href, children, ...rest }) {
    if (!isExternal(href)) {
      // In-page anchors must stay in the page.
      return (
        <a href={href} {...rest}>
          {children}
        </a>
      );
    }
    return (
      <a
        href={href}
        target="_blank"
        // noopener denies the opened page access to window.opener, which it
        // could otherwise use to redirect this tab. noreferrer keeps the
        // referrer off the request.
        rel="noopener noreferrer"
        {...rest}
      >
        {children}
      </a>
    );
  },

  img({ src, alt }) {
    const url = typeof src === 'string' ? src : '';
    if (isExternal(url) || url.startsWith('data:')) {
      return <img src={url} alt={alt ?? ''} style={{ maxWidth: '100%', borderRadius: 6 }} />;
    }
    // Relative path: the file was never shipped with the exercise.
    return (
      <span
        style={{
          display: 'inline-block',
          color: 'var(--text-dim)',
          fontSize: '0.82rem',
          fontStyle: 'italic',
          border: '1px dashed var(--border-strong)',
          borderRadius: 6,
          padding: '0.35rem 0.6rem',
        }}
      >
        [diagram not included with this exercise{alt ? `: ${alt}` : ''}]
      </span>
    );
  },
};
