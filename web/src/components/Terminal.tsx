/**
 * The results pane.
 *
 * A real VT100 emulator (xterm.js), not a styled textbox — cargo's colours,
 * progress rendering and error underlines all arrive intact.
 *
 * It is an OUTPUT surface: read-only, with no shell attached. Attaching one
 * gave the pane a `runner@…:/workspace$` prompt before anything had been run,
 * and let students type into it, which suggested the pane was somewhere to work
 * rather than somewhere to read results.
 *
 * Output is written with `term.write()`, which renders terminal cells. It never
 * touches innerHTML: this is student-authored output, and the reason the
 * session cookie is httpOnly.
 */

import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';

const PLACEHOLDER = '\x1b[2mYour run and submit results will appear here.\x1b[0m\r\n';

export interface TerminalHandle {
  write: (data: string) => void;
  /** Wipe the pane, scrollback included, so an old run cannot be read as the new one. */
  clear: () => void;
}

interface Props {
  onReady?: (handle: TerminalHandle) => void;
  /** V2 phones and tablets: plain selectable text instead of the emulator. */
  plain?: boolean;
}

export function TerminalPane({ onReady, plain }: Props) {
  return plain ? <PlainPane onReady={onReady} /> : <XtermPane onReady={onReady} />;
}

/** ANSI colour and cursor codes, dropped for plain text; \r\n becomes \n. */
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07/g;

export function toPlain(data: string): string {
  return data.replace(ANSI, '').replace(/\r\n/g, '\n').replace(/\r/g, '');
}

const PLAIN_MAX = 1024 * 1024;

function PlainPane({ onReady }: { onReady?: Props['onReady'] }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLPreElement | null>(null);
  useEffect(() => {
    onReady?.({
      write: (data) => setText((t) => (t + toPlain(data)).slice(-PLAIN_MAX)),
      clear: () => setText(''),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [text]);
  return (
    <pre
      ref={ref}
      aria-live="polite"
      style={{
        height: '100%', width: '100%', margin: 0, boxSizing: 'border-box', overflow: 'auto', background: 'var(--code-bg)',
        color: text ? 'var(--text)' : 'var(--text-dim)', padding: '.5rem .6rem', fontSize: '.78rem', lineHeight: 1.45,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      }}
    >
      {text || 'Your run and submit results will appear here.'}
    </pre>
  );
}

function XtermPane({ onReady }: { onReady?: Props['onReady'] }) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new XTerm({
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      fontSize: 13,
      convertEol: true,
      // Output only: keystrokes ignored, and no cursor to imply a prompt.
      disableStdin: true,
      cursorBlink: false,
      // xterm paints to a canvas and cannot read CSS variables, so the
      // theme tokens are mirrored here. --code-bg / --text / --text-dim.
      theme: { background: '#05060a', foreground: '#dbe3ef', cursor: '#05060a' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(host);
    fit.fit();
    term.write(PLACEHOLDER);

    const handle: TerminalHandle = {
      write: (data) => term.write(data),
      // reset() rather than clear(): clear() leaves the previous run just above
      // the fold, which is the confusion worth avoiding.
      clear: () => term.reset(),
    };

    // Refit on window resize AND on pane drags, or output wraps at the wrong
    // column once the splitter has been moved.
    const onResize = () => fit.fit();
    window.addEventListener('resize', onResize);
    const observer = new ResizeObserver(() => fit.fit());
    observer.observe(host);

    onReady?.(handle);

    return () => {
      window.removeEventListener('resize', onResize);
      observer.disconnect();
      term.dispose();
    };
    // Mount once: re-creating the terminal would drop everything already printed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} style={{ height: '100%', width: '100%', background: 'var(--code-bg)' }} />;
}
