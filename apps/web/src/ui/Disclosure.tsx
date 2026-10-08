import { useState, type ReactNode } from 'react';
import { usePhoneAny } from '../phone.js';
import { useT } from './useT.js';

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
