import { useState, type ReactNode } from 'react';
import { usePhoneAny } from '../lib/preferences/phone.js';
import { useT } from './useT.js';

export function Fold({
  title,
  children,
  open,
}: {
  title: ReactNode;
  children: ReactNode;
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
