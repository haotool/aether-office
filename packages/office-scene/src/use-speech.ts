import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { countWords, revealWords, toInlineSegments, type PreviewLine } from '@aether/kernel';

/** A reply is cut to this many characters before it is shown (the server already cut it on a safe boundary). */
const SHOW_CHARS = 400;
const TYPE_TICK_MS = 40;
/** A reply types out in at most about this long, however many words it has. */
const TYPE_MAX_MS = 1800;

/**
 * The lines of a text, and how much of them to show: a text that changes after the first look is typed out word by word
 * (unless motion is reduced), the caret following the last word. `typing` is true while words are still to come.
 */
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
    // typed.text is read from this render on purpose: it is what the text was when it changed.
  }, [text, animate, total]);
  const shown: PreviewLine[] = useMemo(
    () => (count >= total ? lines : revealWords(lines, count)),
    [lines, count, total],
  );
  return { lines: shown, typing: count < total };
}

const SCROLL_PX_PER_S = 30;
const PAUSE_MS = 1200;
/** The text scrolls through twice, then stays at its end. */
const PASSES = 2;

/**
 * A teleprompter for a bubble whose text is taller than the bubble: after a pause it scrolls at a readable speed to the
 * end, pauses, and goes round once more. It waits while `held` is true (the pointer is on it and the person can scroll),
 * while the bubble is hidden, and does nothing when `active` is false. One requestAnimationFrame loop per bubble that
 * overflows; no React render per frame.
 */
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
      if (held.current)
        position = el.scrollTop; // the person is reading: carry on from where they leave it
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

/** Whether the content of `box` is taller than the box, re-measured whenever `watch` changes. */
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
