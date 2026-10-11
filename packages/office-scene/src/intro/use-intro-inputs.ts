import { useEffect, type Dispatch } from 'react';
import type { IntroAction, IntroState } from './intro-machine.js';

const SMOOTH_FRAMES = 10;
const SMOOTH_MS = 40;
const WAIT_MS = 4000;
const TICK_MS = 100;
const BARE_MODIFIERS = new Set(['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Fn']);

/**
 * Preparing: the tour starts when frames run smoothly, or after a few seconds at most. Playing: the camera's frames
 * carry the clock (see `pose` in use-intro-tour.ts); this tick is the backstop when no frame runs.
 */
export function useIntroClock(status: IntroState['status'], dispatch: Dispatch<IntroAction>) {
  useEffect(() => {
    if (status !== 'preparing') return;
    let smooth = 0;
    let last = performance.now();
    const began = last;
    let raf = 0;
    const step = (now: number) => {
      smooth = now - last < SMOOTH_MS ? smooth + 1 : 0;
      last = now;
      if (smooth >= SMOOTH_FRAMES || now - began >= WAIT_MS) dispatch({ type: 'ready', now });
      else raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [status, dispatch]);

  useEffect(() => {
    if (status !== 'playing') return;
    const every = setInterval(() => dispatch({ type: 'tick', now: performance.now() }), TICK_MS);
    return () => clearInterval(every);
  }, [status, dispatch]);
}

export function useIntroInterrupts(active: boolean, dispatch: Dispatch<IntroAction>) {
  useEffect(() => {
    if (!active) return;
    const inside = (event: Event) => (event.target as Element | null)?.closest?.('[data-intro-ui]');
    const touch = (event: Event) => {
      if (!inside(event)) dispatch({ type: 'interrupt' });
    };
    const key = (event: KeyboardEvent) => {
      if (BARE_MODIFIERS.has(event.key)) return;
      if (event.key === 'Escape') dispatch({ type: 'skip', now: performance.now() });
      else if (!inside(event)) dispatch({ type: 'interrupt' });
    };
    const hidden = () => {
      if (document.hidden) dispatch({ type: 'abort' });
    };
    window.addEventListener('pointerdown', touch, true);
    window.addEventListener('touchstart', touch, { capture: true, passive: true });
    window.addEventListener('wheel', touch, { capture: true, passive: true });
    window.addEventListener('keydown', key, true);
    document.addEventListener('visibilitychange', hidden);
    return () => {
      window.removeEventListener('pointerdown', touch, true);
      window.removeEventListener('touchstart', touch, true);
      window.removeEventListener('wheel', touch, true);
      window.removeEventListener('keydown', key, true);
      document.removeEventListener('visibilitychange', hidden);
    };
  }, [active, dispatch]);
}
