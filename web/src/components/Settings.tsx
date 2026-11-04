/**
 * Preferences panel (V2 feature 4, D24). Every control applies at once and is
 * saved to the account; there is no Save button to forget.
 */
import { Modal } from './Modal.js';
import { FONT_SIZE_MAX, FONT_SIZE_MIN, type Preferences } from '../lib/preferences.js';

interface Props {
  open: boolean;
  onClose: () => void;
  prefs: Preferences;
  onChange: (patch: Partial<Preferences>) => void;
}

const row: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '.55rem 0', borderBottom: '1px solid var(--border)' };
const control: React.CSSProperties = { background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius)', padding: '.3rem .5rem', font: 'inherit', fontSize: '.85rem' };

export function Settings({ open, onClose, prefs, onChange }: Props) {
  return (
    <Modal open={open} onClose={onClose} labelledBy="settings-title" width="min(26rem, 92vw)">
      <div style={{ padding: '1.3rem 1.4rem 1.1rem' }}>
        <h2 id="settings-title" style={{ margin: '0 0 .6rem', fontSize: '1.05rem', fontWeight: 600 }}>
          Preferences
        </h2>
        <div style={{ fontSize: '.88rem' }}>
          <label style={row}>
            Font size
            <input
              type="number"
              style={{ ...control, width: '4.5rem' }}
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={prefs.fontSize}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= FONT_SIZE_MIN && n <= FONT_SIZE_MAX) onChange({ fontSize: n });
              }}
            />
          </label>
          <label style={row}>
            Tab size
            <select style={control} value={prefs.tabSize} onChange={(e) => onChange({ tabSize: Number(e.target.value) as Preferences['tabSize'] })}>
              <option value={2}>2</option>
              <option value={4}>4</option>
              <option value={8}>8</option>
            </select>
          </label>
          <label style={row}>
            Word wrap
            <input type="checkbox" checked={prefs.wordWrap} onChange={(e) => onChange({ wordWrap: e.target.checked })} />
          </label>
          <label style={{ ...row, borderBottom: 'none' }}>
            Keybindings
            <select style={control} value={prefs.keybindings} onChange={(e) => onChange({ keybindings: e.target.value as Preferences['keybindings'] })}>
              <option value="default">Default</option>
              <option value="vim">Vim</option>
            </select>
          </label>
        </div>
        <p style={{ margin: '.6rem 0 0', color: 'var(--text-dim)', fontSize: '.76rem' }}>Saved to your account, on every device.</p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '.9rem' }}>
          <button type="button" onClick={onClose} style={{ ...control, cursor: 'pointer', padding: '.35rem .9rem' }}>
            Done
          </button>
        </div>
      </div>
    </Modal>
  );
}
