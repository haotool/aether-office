import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Layout } from '@aether/contracts';
import { floorY } from '../scene/scene-geometry.js';
import type { SceneBridge } from '../components/SceneBridge.js';
import { checkSeat, snapSeat, type SeatCheck } from './seat-drag.js';
import { listenWhileDragging } from './window-drag.js';

export type SeatMove = {
  agentId: string;
  deskId: string;
  floor: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
};

export type SeatDrag = {
  agentId: string;
  deskId: string;
  floor: number;
  rotation: number;
  from: { x: number; z: number };
  x: number;
  z: number;
  check: SeatCheck;
};

type SeatDragOptions = {
  layout: Layout;
  exploded: boolean;
  bridge: RefObject<SceneBridge | null>;
  allowed: boolean;
  onMove: ((move: SeatMove) => void) | undefined;
  onEnd: (outcome: 'moved' | 'cancelled' | SeatCheck) => void;
};
type DragHooks = Pick<SeatDragOptions, 'onMove' | 'onEnd'>;

function beginDrag(agentId: string, desk: Layout['objects'][number]): SeatDrag {
  return {
    agentId,
    deskId: desk.id,
    floor: desk.floor ?? 0,
    rotation: desk.rotation,
    from: { x: desk.x, z: desk.z },
    x: desk.x,
    z: desk.z,
    check: { ok: true },
  };
}

function carriedTo(
  d: SeatDrag,
  ground: readonly [number, number],
  layout: Layout,
): SeatDrag | null {
  const x = snapSeat(ground[0]);
  const z = snapSeat(ground[1]);
  return x === d.x && z === d.z ? null : { ...d, x, z, check: checkSeat(layout, d.deskId, x, z) };
}

function reportEnd(d: SeatDrag, outcome: 'drop' | 'cancel', { onMove, onEnd }: DragHooks): void {
  const moved = d.x !== d.from.x || d.z !== d.from.z;
  if (outcome === 'cancel' || !moved) onEnd('cancelled');
  else if (!d.check.ok) onEnd(d.check);
  else {
    onMove?.({
      agentId: d.agentId,
      deskId: d.deskId,
      floor: d.floor,
      from: d.from,
      to: { x: d.x, z: d.z },
    });
    onEnd('moved');
  }
}

export function useSeatDrag({ layout, exploded, bridge, allowed, onMove, onEnd }: SeatDragOptions) {
  const [drag, setDrag] = useState<SeatDrag | null>(null);
  const current = useRef<SeatDrag | null>(null);
  const stop = useRef<(() => void) | null>(null);
  const endedAt = useRef(0);
  const latest = useRef({ layout, exploded, onMove, onEnd });
  latest.current = { layout, exploded, onMove, onEnd };
  const grab = useCallback(
    (agentId: string, start: { clientX: number; clientY: number }): boolean => {
      const { layout: now, exploded: spread } = latest.current;
      const desk = now.objects.find((o) => o.agentId === agentId);
      if (!allowed || !desk || !onMove || current.current) return false;
      const y = floorY(desk.floor ?? 0, spread);
      current.current = beginDrag(agentId, desk);
      setDrag(current.current);
      bridge.current?.setOrbit(false);
      document.body.style.cursor = 'grabbing';
      const finish = (outcome: 'drop' | 'cancel') => {
        const d = current.current;
        stop.current?.();
        if (d) reportEnd(d, outcome, latest.current);
      };
      const move = (e: PointerEvent) => {
        const at = bridge.current?.groundAt(e.clientX, e.clientY, y);
        const moved =
          current.current && at && carriedTo(current.current, at, latest.current.layout);
        if (!moved) return;
        current.current = moved;
        setDrag(moved);
      };
      const unlisten = listenWhileDragging(move, finish);
      stop.current = () => {
        unlisten();
        bridge.current?.setOrbit(true);
        document.body.style.cursor = '';
        current.current = null;
        stop.current = null;
        endedAt.current = Date.now();
        setDrag(null);
      };
      move(new PointerEvent('pointermove', start));
      return true;
    },
    [allowed, onMove, bridge],
  );
  useEffect(() => () => stop.current?.(), []);
  const justEnded = useCallback(() => Date.now() - endedAt.current < 300, []);
  return { drag, grab, justEnded };
}
