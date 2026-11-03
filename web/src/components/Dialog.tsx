/**
 * Confirmation dialog. Never alert()/confirm()/prompt().
 *
 * The overlay, focus trap and dismissal live in Modal; this is only the
 * message and the two choices.
 */
import { useState } from 'react';
import { Modal } from './Modal.js';

export interface ConfirmOptions {
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Destructive actions get the red button; ordinary ones do not. */
  destructive?: boolean;
}

interface Props {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onResolve: (confirmed: boolean) => void;
}

export function Dialog({
  open,
  title,
  body,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onResolve,
}: Props) {
  return (
    <Modal
      open={open}
      // Escape and the backdrop mean "I did not choose", which is `false` —
      // never the confirm, and never for a destructive action least of all.
      onClose={() => onResolve(false)}
      role="alertdialog"
      labelledBy="dlg-title"
      describedBy="dlg-body"
    >
      <div style={{ padding: '1.35rem 1.4rem 1.15rem' }}>
        <h2 id="dlg-title" style={{ margin: '0 0 .55rem', fontSize: '1.05rem', fontWeight: 600 }}>
          {title}
        </h2>
        <p id="dlg-body" style={{ margin: '0 0 1.3rem', color: 'var(--text-muted)', lineHeight: 1.55, fontSize: '.9rem' }}>
          {body}
        </p>
        <div style={{ display: 'flex', gap: '.55rem', justifyContent: 'flex-end' }}>
          <button type="button" onClick={() => onResolve(false)} className="dlg-btn dlg-btn-quiet">
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => onResolve(true)}
            className={`dlg-btn ${destructive ? 'dlg-btn-danger' : 'dlg-btn-primary'}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * Promise-based confirmation.
 *
 * `await confirm({...})` reads like the native confirm() it replaces, but
 * renders an in-app dialog — focus-trapped, dismissible, and styled with the
 * application — as required by the project conventions.
 */
export function useConfirm() {
  const [pending, setPending] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => setPending({ ...options, resolve }));

  const dialog = (
    <Dialog
      open={pending !== null}
      title={pending?.title ?? ''}
      body={pending?.body ?? ''}
      confirmLabel={pending?.confirmLabel}
      cancelLabel={pending?.cancelLabel}
      destructive={pending?.destructive}
      onResolve={(ok) => {
        pending?.resolve(ok);
        setPending(null);
      }}
    />
  );

  return { confirm, dialog };
}
