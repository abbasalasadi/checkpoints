/**
 * Markdown renderer tests.
 *
 * Link handling is security-relevant, not just cosmetic: an external link
 * opened without `noopener` hands the new page a `window.opener` reference it
 * can use to redirect this tab.
 */

import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { markdownComponents } from '../src/lib/markdown.js';

const render = (md: string) =>
  renderToStaticMarkup(
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
      {md}
    </ReactMarkdown>,
  );

describe('links', () => {
  test('an external link opens in a new tab', () => {
    const html = render('[The Rust Book](https://doc.rust-lang.org/book/)');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('href="https://doc.rust-lang.org/book/"');
  });

  test('an external link carries noopener, so the new page cannot redirect this tab', () => {
    const html = render('[docs](https://doc.rust-lang.org/std/)');
    expect(html).toMatch(/rel="[^"]*noopener/);
    expect(html).toMatch(/rel="[^"]*noreferrer/);
  });

  test('a protocol-relative link counts as external', () => {
    expect(render('[x](//example.com/page)')).toContain('target="_blank"');
  });

  test('an in-page anchor stays in the page', () => {
    const html = render('[jump](#usage)');
    expect(html).not.toContain('target="_blank"');
    expect(html).toContain('href="#usage"');
  });
});

describe('images', () => {
  test('a diagram that was never shipped renders as a note, not a broken icon', () => {
    // Two upstream READMEs reference PNGs that were never committed.
    const html = render('![imagem](determinant-of-a-3x3-matrix-formula-3.png)');
    expect(html).not.toContain('<img');
    expect(html).toContain('not included');
  });

  test('the alt text is kept, since it is the only description left', () => {
    expect(render('![Insertion sort demo](Insertion-Sort-demo.png)')).toContain(
      'Insertion sort demo',
    );
  });

  test('an absolute image URL still renders as an image', () => {
    expect(render('![x](https://example.com/a.png)')).toContain('<img');
  });
});

describe('formatting the exercises actually use', () => {
  test('fenced rust code becomes a code block', () => {
    const html = render('```rust\nfn main() {}\n```');
    expect(html).toContain('<pre>');
    expect(html).toContain('<code');
  });

  test('gfm tables render', () => {
    const html = render('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table>');
  });

  test('raw HTML in the source is escaped, not injected', () => {
    // react-markdown escapes HTML unless rehype-raw is added, which it is not.
    // The escaped text still contains the literal characters "onerror=", so the
    // assertion has to be that no live element was produced — that is the
    // property that matters.
    const html = render('<img src=x onerror="alert(1)">');
    expect(html).not.toMatch(/<img[^>]*onerror/);
    expect(html).toContain('&lt;img');
  });
});
