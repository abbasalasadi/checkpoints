/**
 * The shell every dialog sits in. Never alert()/confirm()/prompt().
 *
 * Overlay, focus trap, Escape and backdrop dismissal, and focus returned to
 * whatever opened it. Extracted from Dialog when About arrived: two dialogs
 * meant two copies of the trap, and a focus trap that is subtly wrong in one
 * copy is worse than no trap at all.
 *
 * Children are arbitrary — Dialog passes a message and buttons, About passes a
 * whole panel.
 */
import { useEffect, useRef } from 'react';

/* Anything a keyboard can land on. The old trap queried only `button`, which
   would have skipped the links in About and let Tab escape the dialog. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface Props {
  open: boolean;
  /** Escape, backdrop click, or the close control. */
  onClose: () => void;
  /** `alertdialog` interrupts to demand a decision; `dialog` merely informs. */
  role?: 'dialog' | 'alertdialog';
  labelledBy: string;
  describedBy?: string;
  width?: string;
  children: React.ReactNode;
}

export function Modal({
  open,
  onClose,
  role = 'dialog',
  labelledBy,
  describedBy,
  width = 'min(28rem, 92vw)',
  children,
}: Props) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
      if (list.length === 0) return;
      const firstEl = list[0]!;
      const lastEl = list[list.length - 1]!;
      // Wrap at both ends so Tab can never reach the page behind the overlay.
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      (triggerRef.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="presentation"
      className="modal-backdrop"
      // Only a click that starts and ends on the backdrop itself dismisses;
      // a drag that happens to finish out here must not close the dialog.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="modal-panel"
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}
