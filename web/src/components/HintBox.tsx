/**
 * One-line hint (V3 feature 2, D4). Asking starts a 10-second wait before the
 * hint shows, a nudge to think once more first. Not offered during an exam (D28).
 */
import { useEffect, useState } from 'react';
import { api, type Language } from '../lib/api.js';

export const HINT_DELAY_SECONDS = 10;

const btn: React.CSSProperties = {
  background: 'transparent', color: 'var(--accent-text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)',
  padding: '.25rem .65rem', font: 'inherit', fontSize: '.8rem', cursor: 'pointer',
};

export function HintBox({ language, slug }: { language: Language; slug: string }) {
  const [wait, setWait] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null | undefined>(undefined);

  useEffect(() => {
    if (wait === null || wait <= 0) return;
    const t = setTimeout(() => setWait((w) => (w === null ? null : w - 1)), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => {
    if (wait !== 0 || hint !== undefined) return;
    let live = true;
    api
      .hint(language, slug)
      .then((r) => live && setHint(r.hint))
      .catch(() => live && setHint(null));
    return () => {
      live = false;
    };
  }, [wait, hint, language, slug]);

  if (wait === null) {
    return (
      <button type="button" style={btn} onClick={() => setWait(HINT_DELAY_SECONDS)} title={`Shows a one-line hint after ${HINT_DELAY_SECONDS} seconds`}>
        Show hint
      </button>
    );
  }
  if (wait > 0) {
    return (
      <div role="status" style={{ fontSize: '.8rem', color: 'var(--text-muted)' }}>
        Hint in {wait}s. One more look at the subject first?{' '}
        <button type="button" style={{ ...btn, border: 'none', padding: 0 }} onClick={() => setWait(null)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <div role="note" style={{ fontSize: '.84rem', lineHeight: 1.5, background: 'var(--raised)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '.5rem .7rem' }}>
      {hint === undefined ? 'Loading…' : (hint ?? 'No hint for this exercise yet.')}
    </div>
  );
}
