/**
 * "Processing" — shown while a run takes longer than a few seconds (owner,
 * 2026-11-05: it replaces the "still running" warning, whose red Stop button
 * appeared without warning and confused students).
 *
 * Calm and informational: a spinner, what is happening, and no action to
 * take. Escape or a click outside hides it for this run; the run goes on and
 * the runner's time limit still applies. Stop stays in the toolbar.
 */
import { Modal } from './Modal.js';

interface Props {
  open: boolean;
  /** Run or Submit. */
  kind: 'run' | 'test';
  /** How long the run has been going, in seconds. */
  elapsed: number;
  onHide: () => void;
}

export function StuckDialog({ open, kind, elapsed, onHide }: Props) {
  return (
    <Modal open={open} onClose={onHide} labelledBy="busy-title" describedBy="busy-body" width="min(25rem, 92vw)">
      <div role="status" aria-live="polite" style={{ padding: '1.5rem 1.4rem 1.3rem', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '.8rem' }}>
        <style>{'@keyframes cp-spin{to{transform:rotate(360deg)}}@media (prefers-reduced-motion: reduce){.cp-spin{animation-duration:3s!important}}'}</style>
        <svg className="cp-spin" width="44" height="44" viewBox="0 0 44 44" aria-hidden style={{ animation: 'cp-spin 1s linear infinite' }}>
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--raised)" strokeWidth="4" />
          <path d="M22 4a18 18 0 0 1 18 18" fill="none" stroke="var(--accent, #6aa7ff)" strokeWidth="4" strokeLinecap="round" />
        </svg>
        <h2 id="busy-title" style={{ margin: 0, fontSize: '1.02rem', fontWeight: 600 }}>
          {kind === 'test' ? 'Checking your submission' : 'Running your code'}
        </h2>
        <p id="busy-body" style={{ margin: 0, color: 'var(--text-muted)', lineHeight: 1.55, fontSize: '.88rem' }}>
          The server is compiling and {kind === 'test' ? 'testing' : 'running'} your code. This usually takes a few seconds and can take up to a minute when the runner is starting up.
        </p>
        <span style={{ color: 'var(--text-dim)', fontSize: '.78rem', fontVariantNumeric: 'tabular-nums' }}>{elapsed} s</span>
      </div>
    </Modal>
  );
}
