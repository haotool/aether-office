import { useEffect, useRef, useState } from 'react';
import { usePreferences } from '../state.js';
import { compact } from './kpi-model.js';

const DURATION_MS = 450;
const easeOut = (p: number) => 1 - (1 - p) ** 3;

/**
 * A number that counts up to its value over a short moment (instantly with reduced motion). The animation writes the text
 * node directly, frame by frame, so React renders once per value, never once per frame.
 */
export function CountUp({ value, format }: { value: number; format?: (n: number) => string }) {
  const locale = usePreferences((s) => s.locale);
  const reduced = usePreferences((s) => s.reducedMotion);
  const show = (n: number) => (format ? format(n) : compact(n, locale));
  const node = useRef<HTMLSpanElement>(null);
  const shown = useRef(0);
  // The first text is fixed at mount: React never rewrites the node afterwards, the effect below owns it.
  const [first] = useState(() => (reduced ? show(value) : show(0)));
  useEffect(() => {
    const el = node.current;
    if (!el) return;
    if (reduced || shown.current === value) {
      shown.current = value;
      el.textContent = show(value);
      return;
    }
    const from = shown.current;
    const started = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const p = Math.min(1, (now - started) / DURATION_MS);
      shown.current = from + (value - from) * easeOut(p);
      el.textContent = show(Math.round(shown.current));
      if (p < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
    // `show` closes over the locale and the formatter only; the value and the motion preference decide when to run.
  }, [value, reduced, locale]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <span ref={node} className="count-up">
      {first}
    </span>
  );
}
