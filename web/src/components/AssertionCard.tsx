/**
 * Expected vs got (V3 feature 4), above the output of a failed submit. The
 * first differing character is marked in both, since that is usually the bug.
 */
import { useState } from 'react';
import { firstDifference, type AssertionDiff } from '../lib/assertion.js';

const pre: React.CSSProperties = {
  margin: 0, padding: '.4rem .55rem', background: 'var(--code-bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
  fontSize: '.78rem', lineHeight: 1.45, whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: '8rem', overflow: 'auto',
};

function Marked({ text, at }: { text: string; at: number }) {
  if (at < 0) return <>{text}</>;
  const ch = text[at];
  return (
    <>
      {text.slice(0, at)}
      <mark style={{ background: 'var(--danger)', color: '#fff', borderRadius: 2 }}>{ch === undefined ? '∅' : ch === '\n' ? '↵\n' : ch === ' ' ? '·' : ch}</mark>
      {ch === undefined ? '' : text.slice(at + 1)}
    </>
  );
}

export function AssertionCard({ diff }: { diff: AssertionDiff }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  const at = firstDifference(diff.actual, diff.expected);
  return (
    <section aria-label="Expected and got" style={{ borderTop: '1px solid var(--border)', padding: '.5rem .7rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5rem', fontSize: '.78rem', color: 'var(--text-muted)' }}>
        <strong style={{ color: 'var(--text)', fontWeight: 600 }}>First failing check</strong>
        {diff.label && <code style={{ fontSize: '.76rem' }}>{diff.label}</code>}
        <button
          type="button"
          onClick={() => setHidden(true)}
          aria-label="Hide"
          style={{ marginLeft: 'auto', background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', font: 'inherit' }}
        >
          ✕
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: '.5rem' }}>
        <div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-dim)', marginBottom: '.2rem' }}>Expected</div>
          <pre style={pre}>
            <Marked text={diff.expected} at={at} />
          </pre>
        </div>
        <div>
          <div style={{ fontSize: '.72rem', color: 'var(--text-dim)', marginBottom: '.2rem' }}>Your result</div>
          <pre style={pre}>
            <Marked text={diff.actual} at={at} />
          </pre>
        </div>
      </div>
    </section>
  );
}
