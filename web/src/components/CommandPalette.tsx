/**
 * Command palette (V3 feature 3): type to filter, ↑/↓ to choose, Enter to run.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { matchesQuery } from '../lib/shortcuts.js';
import { Modal } from './Modal.js';

export interface Command {
  id: string;
  label: string;
  /** Shortcut shown on the right, when there is one. */
  keys?: string;
  run: () => void;
}

export function CommandPalette({ open, onClose, commands }: { open: boolean; onClose: () => void; commands: Command[] }) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement | null>(null);
  const list = useMemo(() => commands.filter((c) => matchesQuery(c.label, query)).slice(0, 50), [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    setTimeout(() => input.current?.focus(), 0);
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const choose = (c: Command | undefined) => {
    if (!c) return;
    onClose();
    c.run();
  };

  return (
    <Modal open={open} onClose={onClose} labelledBy="palette-title" width="min(34rem, 94vw)">
      <div style={{ padding: '.7rem' }}>
        <h2 id="palette-title" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
          Command palette
        </h2>
        <input
          ref={input}
          type="search"
          aria-label="Type a command"
          placeholder="Type a command or an exercise…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, list.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              choose(list[active]);
            }
          }}
          style={{
            width: '100%', boxSizing: 'border-box', background: 'var(--raised)', color: 'var(--text)', border: '1px solid var(--border-strong)',
            borderRadius: 'var(--radius)', padding: '.5rem .65rem', font: 'inherit', fontSize: '.9rem',
          }}
        />
        <ul role="listbox" aria-label="Commands" style={{ listStyle: 'none', margin: '.5rem 0 0', padding: 0, maxHeight: '22rem', overflowY: 'auto' }}>
          {list.length === 0 && <li style={{ padding: '.5rem .6rem', color: 'var(--text-dim)', fontSize: '.85rem' }}>Nothing matches.</li>}
          {list.map((c, i) => (
            <li
              key={c.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(c)}
              style={{
                display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.4rem .6rem', borderRadius: 'var(--radius)', cursor: 'pointer',
                fontSize: '.86rem', background: i === active ? 'var(--raised)' : 'transparent',
              }}
            >
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.label}</span>
              {c.keys && <kbd style={{ color: 'var(--text-dim)', fontSize: '.75rem', fontFamily: 'inherit' }}>{c.keys}</kbd>}
            </li>
          ))}
        </ul>
      </div>
    </Modal>
  );
}
