/**
 * About panel tests.
 *
 * The contact details are the point of the panel, and the Discord link is the
 * part most likely to rot: Discord profile URLs take a numeric snowflake, not a
 * handle, so a well-meant `discord.com/users/abbhasan` would 404 for every
 * student who clicked it. These pin that down.
 */

import { describe, expect, test } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { About } from '../src/components/About.js';

const render = (open: boolean) =>
  renderToStaticMarkup(<About open={open} onClose={() => {}} />);

describe('About', () => {
  test('renders nothing while closed', () => {
    expect(render(false)).toBe('');
  });

  test('credits the developer and their handle', () => {
    const html = render(true);
    expect(html).toContain('Abbas Al-Asadi');
    expect(html).toContain('abbhasan');
  });

  test('says the project is voluntary and wishes students well', () => {
    const html = render(true);
    expect(html).toMatch(/voluntary/i);
    expect(html).toMatch(/good luck/i);
  });

  test('credits the training centre and links to it', () => {
    const html = render(true);
    expect(html).toContain('Reboot Coding Institute');
    expect(html).toContain('Bahrain');
    expect(html).toContain('href="https://reboot01.com/"');
  });

  test('disclaims official status and dates the checkpoint list', () => {
    const html = render(true);
    expect(html).toMatch(/not an official Reboot application/i);
    expect(html).toMatch(/personal effort/i);
    expect(html).toContain('April 2026');
  });

  test('never links to a handle-based Discord profile URL', () => {
    // Only a numeric id is a real profile; anything else is a dead link.
    const html = render(true);
    const links = [...html.matchAll(/href="(https:\/\/discord\.com\/users\/[^"]*)"/g)];
    for (const [, url] of links) {
      expect(url).toMatch(/^https:\/\/discord\.com\/users\/\d+$/);
    }
  });

  test('opens any external link safely', () => {
    // window.opener on a target=_blank link lets the opened page redirect this tab.
    const html = render(true);
    for (const [tag] of html.matchAll(/<a\b[^>]*>/g)) {
      if (tag.includes('target="_blank"')) {
        expect(tag).toContain('rel="noopener noreferrer"');
      }
    }
  });
});
