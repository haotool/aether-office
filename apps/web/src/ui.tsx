import {
  useEffect,
  useRef,
  useState,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePreferences } from './state.js';
import { translate, type Key } from './i18n.js';
import { usePhoneAny } from './phone.js';
export function useT() {
  const locale = usePreferences((s) => s.locale);
  return (key: Key) => translate(locale, key);
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
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
    <dialog ref={ref} className="modal" onCancel={onClose} aria-label={title}>
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
 * backdrop close it; focus moves in and returns to what opened it.
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
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close.current();
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, []);
  return createPortal(
    <>
      <button className="sheet-backdrop" aria-label={t('close')} onClick={onClose} />
      <section ref={ref} tabIndex={-1} className="sheet" role="dialog" aria-label={title}>
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

/**
 * A section that folds away: open on a screen with room, closed on a phone, where a dialog full of explanation would
 * hide what it is about. The summary is the whole control.
 */
export function Fold({
  title,
  children,
  open,
}: {
  title: ReactNode;
  children: ReactNode;
  /** Open on a phone too (the one section the dialog exists for). */
  open?: boolean;
}) {
  const phone = usePhoneAny();
  return (
    <details className="fold" open={open || !phone}>
      <summary>{title}</summary>
      {children}
    </details>
  );
}

/** An explanation that a phone keeps behind an "i" instead of printing it above the content. */
export function Hint({ children }: { children: ReactNode }) {
  const t = useT();
  return (
    <>
      <p className="hint-text">{children}</p>
      <details className="hint-fold">
        <summary aria-label={t('hint')}>ⓘ</summary>
        <p>{children}</p>
      </details>
    </>
  );
}

/** Long text: three lines on a phone, the rest on a tap or Enter; whole on a larger screen. */
export function Clamp({ children, className = '' }: { children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const phone = usePhoneAny();
  if (!phone) return <p className={className}>{children}</p>;
  return (
    <p
      className={`${className} clamp ${open ? 'open' : ''}`}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={() => setOpen(!open)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          setOpen(!open);
        }
      }}
    >
      {children}
    </p>
  );
}

export function Empty({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-orbit">
        <span />
      </div>
      <h3>{title}</h3>
      {hint && <p>{hint}</p>}
      {action}
    </div>
  );
}
export function Badge({ state }: { state: string }) {
  const t = useT();
  const key = state as Key;
  return (
    <span className={`badge state-${state}`}>
      <span />
      {t(key) ?? state}
    </span>
  );
}
export function PageHeading({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        {subtitle && <Hint>{subtitle}</Hint>}
      </div>
      {action}
    </div>
  );
}
export function Field({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {isValidElement(children)
        ? cloneElement(children as ReactElement<{ id?: string }>, { id })
        : children}
    </div>
  );
}
