import {
  useEffect,
  useRef,
  useId,
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from 'react';
import { X, ArrowUpRight } from 'lucide-react';
import { usePreferences } from './state.js';
import { translate, type Key } from './i18n.js';
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
export function AvatarIcon({
  species,
  color,
  name,
  size = 36,
}: {
  species: string;
  color: string;
  name: string;
  size?: number;
}) {
  const icons: Record<string, string> = {
    fox: '🦊',
    cat: '🐱',
    rabbit: '🐰',
    bear: '🐻',
    otter: '🦦',
    raccoon: '🦝',
    panda: '🐼',
    dog: '🐕',
  };
  return (
    <span
      className="avatar-icon"
      style={{ width: size, height: size, background: `${color}20`, fontSize: size * 0.56 }}
      aria-label={name}
    >
      {icons[species] ?? '◌'}
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
        {subtitle && <p>{subtitle}</p>}
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
