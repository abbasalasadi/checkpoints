/**
 * Overflow menu.
 *
 * Save and the three restore actions are all optional — autosave covers "do not
 * lose my work" and the passing snapshot covers "do not lose my answer" — so
 * they belong behind one control rather than crowding the row that Run and
 * Submit live in.
 */

import { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon.js';

export interface MenuItem {
  label: string;
  onSelect: () => void;
  destructive?: boolean;
  disabled?: boolean;
}

interface Props {
  /** Passive text at the top — reassurance, not an action. */
  note?: string;
  /** Groups are rendered with a rule between them; empty groups are dropped. */
  groups: MenuItem[][];
  disabled?: boolean;
}

export function Menu({ note, groups, disabled = false }: Props) {
  const [open, setOpen] = useState(false);
  const host = useRef<HTMLDivElement | null>(null);

  // Close on an outside click or Escape, or the menu outlives its usefulness.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (host.current && !host.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const visible = groups.map((g) => g.filter((i) => !i.disabled)).filter((g) => g.length > 0);

  return (
    <div ref={host} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="More actions"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          background: 'transparent',
          color: disabled ? 'var(--disabled-text)' : 'var(--text-muted)',
          border: `1px solid ${disabled ? 'var(--border)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--radius)',
          padding: '.3rem .5rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          font: 'inherit',
        }}
      >
        <Icon name="dots" size={16} />
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: 'absolute',
            top: 'calc(100% + .35rem)',
            right: 0,
            minWidth: '15rem',
            background: 'var(--raised)',
            border: '1px solid var(--border-strong)',
            borderRadius: 8,
            padding: '.3rem',
            boxShadow: 'var(--shadow)',
            zIndex: 50,
          }}
        >
          {note && (
            <div style={{ color: 'var(--text-dim)', fontSize: '.74rem', padding: '.3rem .55rem .4rem' }}>
              {note}
            </div>
          )}
          {visible.map((group, gi) => (
            <div
              key={gi}
              style={{
                borderTop: gi > 0 || note ? '1px solid var(--border)' : undefined,
                paddingTop: gi > 0 || note ? '.25rem' : 0,
                marginTop: gi > 0 ? '.25rem' : 0,
              }}
            >
              {group.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setOpen(false);
                    item.onSelect();
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    background: 'transparent',
                    color: item.destructive ? 'var(--danger)' : 'var(--text)',
                    border: 'none',
                    borderRadius: 5,
                    padding: '.35rem .55rem',
                    cursor: 'pointer',
                    font: 'inherit',
                    fontSize: '.82rem',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--hover)')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
