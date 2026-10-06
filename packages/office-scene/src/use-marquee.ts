import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SceneBridge } from './SceneBridge.js';

/** A rectangle dragged out over the canvas, in CSS pixels from its top left. */
type Marquee = { x: number; y: number; width: number; height: number };
/** Less than this and the press was a click, not a rectangle. */
const MIN_PX = 6;

/** Pure. The ids whose screen position lies inside the rectangle. */
export function insideMarquee(
  rect: Marquee,
  points: ReadonlyMap<string, readonly [number, number]>,
): string[] {
  return [...points]
    .filter(
      ([, [x, y]]) =>
        x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height,
    )
    .map(([id]) => id);
}

/**
 * Shift + drag on the empty floor draws a rectangle and selects the characters in it. The press is taken before the
 * orbit controls see it (they are switched off for the drag); a bare Shift + click is left to the characters.
 */
export function useMarquee({
  container,
  bridge,
  points,
  enabled,
  onSelect,
}: {
  container: RefObject<HTMLElement | null>;
  bridge: RefObject<SceneBridge | null>;
  /** Where each selectable character is in the world (head height), by id. */
  points: ReadonlyMap<string, [number, number, number]>;
  enabled: boolean;
  onSelect: (ids: string[]) => void;
}) {
  const [rect, setRect] = useState<Marquee | null>(null);
  const latest = useRef({ points, onSelect });
  latest.current = { points, onSelect };
  useEffect(() => {
    const host = container.current;
    if (!host || !enabled) return;
    const down = (e: PointerEvent) => {
      if (!e.shiftKey || e.button !== 0 || e.pointerType === 'touch') return;
      if (!(e.target instanceof HTMLCanvasElement)) return;
      const box = host.getBoundingClientRect();
      const origin = { x: e.clientX - box.left, y: e.clientY - box.top };
      let drawn: Marquee | null = null;
      bridge.current?.setOrbit(false);
      const move = (m: PointerEvent) => {
        const x = m.clientX - box.left;
        const y = m.clientY - box.top;
        drawn = {
          x: Math.min(origin.x, x),
          y: Math.min(origin.y, y),
          width: Math.abs(x - origin.x),
          height: Math.abs(y - origin.y),
        };
        if (drawn.width > MIN_PX || drawn.height > MIN_PX) setRect(drawn);
      };
      const finish = (commit: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('keydown', key);
        bridge.current?.setOrbit(true);
        setRect(null);
        if (!commit || !drawn || (drawn.width <= MIN_PX && drawn.height <= MIN_PX)) return;
        const seen = bridge.current?.screenOf(latest.current.points);
        if (seen) latest.current.onSelect(insideMarquee(drawn, seen));
      };
      const up = () => finish(true);
      const cancel = () => finish(false);
      const key = (k: KeyboardEvent) => k.key === 'Escape' && finish(false);
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('keydown', key);
    };
    host.addEventListener('pointerdown', down, true); // before the canvas's own listeners
    return () => host.removeEventListener('pointerdown', down, true);
  }, [container, bridge, enabled]);
  return rect;
}
