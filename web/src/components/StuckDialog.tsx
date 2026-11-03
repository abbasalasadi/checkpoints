/**
 * "This is taking a while" — shown mid-run, before the limit is reached.
 *
 * This is the one warning that earns a popup rather than the inline notice the
 * other outcomes use. Three things justify interrupting here and nowhere else:
 *
 *   - it is rare: only runs past RUNNER_WARN_SECONDS ever see it
 *   - it is time-critical: waiting out the limit wastes the student's time and
 *     holds a slot another student is queued for
 *   - it is actionable, and the action is right here — Cancel is in the dialog,
 *     so the popup does not block the very control it is recommending
 *
 * Dismissing it does not stop the run; the limit still applies. It does not
 * return for the same run, because a warning that reappears every few seconds
 * is one you close without reading.
 */
import { Modal } from './Modal.js';

interface Props {
  open: boolean;
  /** How long the run has been going, in seconds. */
  elapsed: number;
  /** When the runner will stop it. */
  timeoutSeconds: number;
  onKeepWaiting: () => void;
  onCancel: () => void;
}

export function StuckDialog({ open, elapsed, timeoutSeconds, onKeepWaiting, onCancel }: Props) {
  const remaining = Math.max(0, timeoutSeconds - elapsed);
  return (
    <Modal
      open={open}
      // Escape and the backdrop mean "let it keep going" — never a silent
      // cancel, which would destroy work the student did not ask to lose.
      onClose={onKeepWaiting}
      labelledBy="stuck-title"
      describedBy="stuck-body"
      width="min(27rem, 92vw)"
    >
      <div style={{ padding: '1.35rem 1.4rem 1.15rem' }}>
        <h2 id="stuck-title" style={{ margin: '0 0 .55rem', fontSize: '1.05rem', fontWeight: 600 }}>
          Your program is still running
        </h2>
        <p
          id="stuck-body"
          style={{ margin: '0 0 1.3rem', color: 'var(--text-muted)', lineHeight: 1.55, fontSize: '.9rem' }}
        >
          It has been going for {elapsed} seconds. If your code has a loop that never ends, it will
          not finish on its own — it will be stopped in {remaining} second{remaining === 1 ? '' : 's'}.
          <br />
          <br />
          Check any <code>loop</code>, <code>while</code>, or recursion for a condition that never
          becomes false. A first run can also be slow simply because it is compiling.
        </p>
        <div style={{ display: 'flex', gap: '.55rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={onKeepWaiting} className="dlg-btn dlg-btn-quiet">
            Keep waiting
          </button>
          <button type="button" onClick={onCancel} className="dlg-btn dlg-btn-danger">
            Stop the run
          </button>
        </div>
      </div>
    </Modal>
  );
}
