/** Keyboard shortcut sheet (V3 feature 3), drawn from the same table as the key handler. */
import { keyLabel, SHORTCUTS } from '../lib/shortcuts.js';
import { Modal } from './Modal.js';

export function ShortcutSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="shortcuts-title" width="min(26rem, 92vw)">
      <div style={{ padding: '1.2rem 1.4rem 1.1rem' }}>
        <h2 id="shortcuts-title" style={{ margin: '0 0 .7rem', fontSize: '1.05rem', fontWeight: 600 }}>
          Keyboard shortcuts
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.86rem' }}>
          <tbody>
            {SHORTCUTS.map((s) => (
              <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '.4rem 0' }}>{s.label}</td>
                <td style={{ padding: '.4rem 0', textAlign: 'right' }}>
                  <kbd style={{ background: 'var(--raised)', border: '1px solid var(--border-strong)', borderRadius: 4, padding: '.05rem .4rem', fontFamily: 'inherit', fontSize: '.78rem' }}>
                    {keyLabel(s.keys)}
                  </kbd>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ margin: '.7rem 0 0', color: 'var(--text-dim)', fontSize: '.76rem' }}>The editor&apos;s own keys (undo, comment, multi-cursor…) work as usual.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.8rem' }}>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '.35rem .9rem', font: 'inherit', fontSize: '.85rem', cursor: 'pointer' }}
          >
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
