import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useT } from './useT.js';

export function Modal({
  title,
  onClose,
  dock = false,
  children,
}: {
  title: string;
  onClose: () => void;
  /** Stands at the side instead of the middle, so the page behind it (a live preview) stays in view. */
  dock?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const t = useT();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog?.showModal();
    dialog
      ?.querySelector<HTMLElement>(
        'input:not([type="file"]):not([type="hidden"]):not(:disabled),textarea:not(:disabled),select:not(:disabled)',
      )
      ?.focus();
    return () => {
      dialog?.close();
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${dock ? 'modal-dock' : ''}`}
      onCancel={onClose}
      aria-label={title}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label={t('close')} onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
/**
 * A list in a bottom sheet over everything (a phone's way to pick from a few things without leaving the scene): a
 * title with a count, an action (the close button unless one is given), and the rows as `<li>`s. Escape and the
 * backdrop close it; focus moves in, the page behind is inert while it is open, and focus returns to what opened it.
 */
export function Sheet({
  title,
  count,
  onClose,
  action,
  children,
}: {
  title: string;
  count?: number;
  onClose: () => void;
  action?: ReactNode;
  children: ReactNode;
}) {
  const t = useT();
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    const page = document.getElementById('root'); // the sheet sits beside it, in the body
    if (page) page.inert = true; // so neither Tab nor a screen reader reaches the page behind
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (page) page.inert = false;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return createPortal(
    <>
      <button
        className="sheet-backdrop"
        aria-label={t('close')}
        aria-hidden="true"
        tabIndex={-1}
        onClick={onClose}
      />
      <section
        ref={ref}
        tabIndex={-1}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header>
          <h2>
            {title} {count !== undefined && <small>{count}</small>}
          </h2>
          {action ?? (
            <button className="icon-button" aria-label={t('close')} onClick={onClose}>
              <X size={20} />
            </button>
          )}
        </header>
        <ul>{children}</ul>
      </section>
    </>,
    document.body, // out of the overlay's own stacking context, over everything
  );
}
