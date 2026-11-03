/**
 * Transient confirmation.
 *
 * For things the student did and can forget about — saved a copy, restored one.
 * Autosave deliberately says nothing: the student did not ask for it and cannot
 * act on it.
 *
 * A failure is NOT a toast. "Your work is not saved" is a state, not an event,
 * and must stay on screen until it is no longer true.
 */

import { useEffect, useState } from 'react';

export function useToast() {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (message === null) return;
    const id = setTimeout(() => setMessage(null), 2500);
    return () => clearTimeout(id);
  }, [message]);

  const toast = (
    <div
      // polite so it is announced without interrupting, and present in the DOM
      // even when empty so the announcement is not missed.
      aria-live="polite"
      style={{
        position: 'absolute',
        right: '.9rem',
        bottom: '.7rem',
        pointerEvents: 'none',
        zIndex: 40,
      }}
    >
      {message && (
        <div
          style={{
            background: 'var(--raised)',
            border: '1px solid var(--border-strong)',
            color: 'var(--text)',
            borderRadius: 'var(--radius)',
            padding: '.35rem .7rem',
            fontSize: '.8rem',
            boxShadow: 'var(--shadow)',
          }}
        >
          {message}
        </div>
      )}
    </div>
  );

  return { toast, showToast: setMessage };
}
