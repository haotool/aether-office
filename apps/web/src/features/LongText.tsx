import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useT } from '../ui/useT.js';

/** A message taller than this is folded behind "show more", with a fade at the cut. */
const FOLD_PX = 420;
/** Folding saves at least this much, or the toggle is not worth its row. */
const FOLD_SLACK_PX = 80;

/** Long content, folded to a fixed height with a fade and a toggle; shorter content is shown as it is, with no jump. */
export function LongText({ children, foldable }: { children: ReactNode; foldable: boolean }) {
  const t = useT();
  const body = useRef<HTMLDivElement>(null);
  const [tall, setTall] = useState(false);
  const [open, setOpen] = useState(false);
  // Measured before the first paint, and again when the content or the width changes.
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
