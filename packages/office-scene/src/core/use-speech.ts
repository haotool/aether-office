import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { countWords, revealWords, toInlineSegments, type PreviewLine } from '@aether/kernel';

const SHOW_CHARS = 400;
const TYPE_TICK_MS = 40;
const TYPE_MAX_MS = 1800;

export function useTypedLines(text: string, animate: boolean) {
  const lines = useMemo(() => toInlineSegments(text, { maxChars: SHOW_CHARS }), [text]);
  const total = useMemo(() => countWords(lines), [lines]);
  const [typed, setTyped] = useState({ text, count: total });
  // Until the effect below has started typing a new text, none of it is shown (never a flash of the whole reply).
  const count = typed.text === text ? typed.count : animate ? 0 : total;
  useEffect(() => {
    if (typed.text === text) return;
    if (!animate) {
      setTyped({ text, count: total });
      return;
    }
    const step = Math.max(1, Math.ceil(total / (TYPE_MAX_MS / TYPE_TICK_MS)));
    let n = 0;
    setTyped({ text, count: 0 });
    const timer = setInterval(() => {
      n = Math.min(total, n + step);
      setTyped({ text, count: n });
      if (n >= total) clearInterval(timer);
    }, TYPE_TICK_MS);
    return () => clearInterval(timer);
  }, [text, animate, total]);
  const shown: PreviewLine[] = useMemo(
    () => (count >= total ? lines : revealWords(lines, count)),
    [lines, count, total],
  );
  return { lines: shown, typing: count < total };
}

const SCROLL_PX_PER_S = 30;
const PAUSE_MS = 1200;
const PASSES = 2;

export function useTeleprompter(
  box: RefObject<HTMLElement | null>,
  active: boolean,
  held: RefObject<boolean>,
  restartOn: string,
) {
  useEffect(() => {
    const el = box.current;
    if (!el || !active) return;
    let frame = 0;
    let last = performance.now();
    let wait = PAUSE_MS;
    let pass = 1;
    let position = 0;
    el.scrollTop = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      const max = el.scrollHeight - el.clientHeight;
      const hidden = el.closest<HTMLElement>('.speech')?.style.visibility === 'hidden';
      if (held.current) position = el.scrollTop;
      else if (max > 1 && !hidden) {
        if (wait > 0) wait -= dt;
        else if (position < max) {
          position = Math.min(max, position + (SCROLL_PX_PER_S * dt) / 1000);
          el.scrollTop = position;
          if (position >= max) wait = PAUSE_MS;
        } else if (pass < PASSES) {
          pass++;
          position = 0;
          el.scrollTop = 0;
          wait = PAUSE_MS;
        } else return;
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [box, active, held, restartOn]);
}

export function useOverflowing(box: RefObject<HTMLElement | null>, watch: unknown): boolean {
  const [over, setOver] = useState(false);
  const was = useRef(false);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const next = el.scrollHeight - el.clientHeight > 1;
    if (next !== was.current) {
      was.current = next;
      setOver(next);
    }
  }, [box, watch]);
  return over;
}
