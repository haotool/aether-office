import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../../ui/useT.js';

const FOLD_PX = 420;
const FOLD_SLACK_PX = 80;

export function LongText({ children, foldable }: { children: ReactNode; foldable: boolean }) {
  const t = useT();
  const body = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  useLayoutEffect(() => {
    const el = body.current;
    if (!el || !foldable) return;
    const measure = () => setTall(el.scrollHeight > FOLD_PX + FOLD_SLACK_PX);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [foldable]);
  const folded = foldable && tall && !open;
  return (
    <div className={`long ${folded ? 'folded' : ''}`}>
      <div ref={body} className="long-body" style={folded ? { maxHeight: FOLD_PX } : undefined}>
        {children}
      </div>
      {foldable && tall && (
        <button
          type="button"
          className="long-toggle"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? t('convShowLess') : t('convShowMore')}
        </button>
      )}
    </div>
  );
}
