import { useEffect, useRef, useState, type RefObject } from 'react';
import type { SceneBridge } from '../components/SceneBridge.js';
import { listenWhileDragging } from './window-drag.js';

type Marquee = { x: number; y: number; width: number; height: number };
const MIN_PX = 6;

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

type MarqueeOptions = {
  container: RefObject<HTMLElement | null>;
  bridge: RefObject<SceneBridge | null>;
  points: ReadonlyMap<string, [number, number, number]>;
  enabled: boolean;
  onSelect: (ids: string[]) => void;
};

const spanned = (origin: { x: number; y: number }, x: number, y: number): Marquee => ({
  x: Math.min(origin.x, x),
  y: Math.min(origin.y, y),
  width: Math.abs(x - origin.x),
  height: Math.abs(y - origin.y),
});

const isRect = (rect: Marquee | null): rect is Marquee =>
  rect !== null && (rect.width > MIN_PX || rect.height > MIN_PX);

export function useMarquee({ container, bridge, points, enabled, onSelect }: MarqueeOptions) {
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
        drawn = spanned(origin, m.clientX - box.left, m.clientY - box.top);
        if (isRect(drawn)) setRect(drawn);
      };
      const stop = listenWhileDragging(move, (outcome) => {
        stop();
        bridge.current?.setOrbit(true);
        setRect(null);
        if (outcome === 'cancel' || !isRect(drawn)) return;
        const seen = bridge.current?.screenOf(latest.current.points);
        if (seen) latest.current.onSelect(insideMarquee(drawn, seen));
      });
    };
    host.addEventListener('pointerdown', down, true); // before the canvas's own listeners
    return () => host.removeEventListener('pointerdown', down, true);
  }, [container, bridge, enabled]);
  return rect;
}
