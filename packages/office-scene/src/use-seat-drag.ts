import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Layout } from '@aether/contracts';
import { floorY } from './scene-geometry.js';
import type { SceneBridge } from './SceneBridge.js';
import { checkSeat, snapSeat, type SeatCheck } from './seat-drag.js';

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

/**
 * Drag a member's desk to another seat. `grab` starts it from a press (the page decides when a press may: layout
 * editing is allowed, and Alt is held unless the editor is open); the desk follows the pointer on the floor, snapped to
 * the editor's grid and checked with the layout validation the API uses. Release on a valid seat reports the move,
 * release on an invalid one or Esc cancels it. Orbit is off meanwhile.
 */
export function useSeatDrag({
  layout,
  exploded,
  bridge,
  allowed,
  onMove,
  onEnd,
}: {
  layout: Layout;
  exploded: boolean;
  bridge: RefObject<SceneBridge | null>;
  /** May a press start a drag now (arrange rights, not on a phone)? Alt is checked by the caller. */
  allowed: boolean;
  onMove: ((move: SeatMove) => void) | undefined;
  onEnd: (outcome: 'moved' | 'cancelled' | SeatCheck) => void;
}) {
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
      const floor = desk.floor ?? 0;
      const y = floorY(floor, spread);
      const begin: SeatDrag = {
        agentId,
        deskId: desk.id,
        floor,
        rotation: desk.rotation,
        from: { x: desk.x, z: desk.z },
        x: desk.x,
        z: desk.z,
        check: { ok: true },
      };
      current.current = begin;
      setDrag(begin);
      bridge.current?.setOrbit(false);
      document.body.style.cursor = 'grabbing';
      const finish = (outcome: 'drop' | 'cancel') => {
        const d = current.current;
        stop.current?.();
        if (!d) return;
        const moved = d.x !== d.from.x || d.z !== d.from.z;
        if (outcome === 'cancel' || !moved) latest.current.onEnd('cancelled');
        else if (!d.check.ok) latest.current.onEnd(d.check);
        else {
          latest.current.onMove?.({
            agentId: d.agentId,
            deskId: d.deskId,
            floor: d.floor,
            from: d.from,
            to: { x: d.x, z: d.z },
          });
          latest.current.onEnd('moved');
        }
      };
      const move = (e: PointerEvent) => {
        const at = bridge.current?.groundAt(e.clientX, e.clientY, y);
        const d = current.current;
        if (!at || !d) return;
        const [x, z] = [snapSeat(at[0]), snapSeat(at[1])];
        if (x === d.x && z === d.z) return;
        current.current = {
          ...d,
          x,
          z,
          check: checkSeat(latest.current.layout, d.deskId, x, z),
        };
        setDrag(current.current);
      };
      const up = () => finish('drop');
      const key = (e: KeyboardEvent) => e.key === 'Escape' && finish('cancel');
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      window.addEventListener('keydown', key);
      stop.current = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
        window.removeEventListener('keydown', key);
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
