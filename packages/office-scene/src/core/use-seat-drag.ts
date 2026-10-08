import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Layout } from '@aether/contracts';
import { floorY } from '../scene/scene-geometry.js';
import type { SceneBridge } from '../components/SceneBridge.js';
import { checkSeat, snapSeat, type SeatCheck } from './seat-drag.js';
import { listenWhileDragging } from './window-drag.js';

/** A member's desk dropped on a new seat: what the page saves (and can undo from `from`). */
export type SeatMove = {
  agentId: string;
  deskId: string;
  floor: number;
  from: { x: number; z: number };
  to: { x: number; z: number };
};

/** The desk being carried: where it would land and whether that seat is allowed. */
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
  /** May a press start a drag now (arrange rights, not on a phone)? Alt is checked by the caller. */
  allowed: boolean;
  onMove: ((move: SeatMove) => void) | undefined;
  onEnd: (outcome: 'moved' | 'cancelled' | SeatCheck) => void;
};
type DragHooks = Pick<SeatDragOptions, 'onMove' | 'onEnd'>;

/** The drag of `desk` as it begins: carried nowhere yet, on a seat that is allowed. */
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

/** The drag with its desk snapped to the grid under `ground` and the seat checked; null while the snapped seat has not changed. */
function carriedTo(
  d: SeatDrag,
  ground: readonly [number, number],
  layout: Layout,
): SeatDrag | null {
  const x = snapSeat(ground[0]);
  const z = snapSeat(ground[1]);
  return x === d.x && z === d.z ? null : { ...d, x, z, check: checkSeat(layout, d.deskId, x, z) };
}

/** Reports how a drag ended: a cancel, a release where it began or on a bad seat is 'cancelled' or the check; a good seat is a move. */
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

/**
 * Drag a member's desk to another seat. `grab` starts it from a press (the page decides when a press may: layout
 * editing is allowed, and Alt is held unless the editor is open); the desk follows the pointer on the floor, snapped to
 * the editor's grid and checked with the layout validation the API uses. Release on a valid seat reports the move,
 * release on an invalid one or Esc cancels it. Orbit is off meanwhile.
 */
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
      move(new PointerEvent('pointermove', start)); // the ghost is under the pointer from the first frame
      return true;
    },
    [allowed, onMove, bridge],
  );
  useEffect(() => () => stop.current?.(), []);
  /** A drag just ended: the click that follows its release is not a choice. */
  const justEnded = useCallback(() => Date.now() - endedAt.current < 300, []);
  return { drag, grab, justEnded };
}
