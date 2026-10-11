import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
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
function useSheetFocus(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const opener = document.activeElement;
    const page = document.getElementById('root');
    if (page) page.inert = true;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (page) page.inert = false;
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [ref]);
}

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
  useSheetFocus(ref, onClose);
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
