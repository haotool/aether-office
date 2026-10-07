import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { Layout } from '@aether/contracts';
import { zones } from './layout.js';
import type { Seat } from './director.js';
import { toWorld, type V3 } from './shot-camera.js';
import { SEATING } from './seating.js';
import {
  AGENT_OFFSET,
  FOLLOW_OFFSET,
  OVERVIEW,
  ZONE_OFFSET,
  floorY,
  lookY,
} from './scene-geometry.js';

type Seats = ReadonlyMap<string, Seat>;
type Fly = (target: V3, offset: V3) => void;

/** A point in a seat's own frame, in the world (or, from `baseOnly`, relative to the seat on its floor). */
function seatWorld(seats: Seats, exploded: boolean, id: string, local: V3, baseOnly = false) {
  const seat = seats.get(id);
  if (!seat) return null;
  const point = toWorld(seat, local, baseOnly ? 0 : floorY(seat.floor, exploded));
  return baseOnly ? ([point[0] - seat.x, point[1], point[2] - seat.z] satisfies V3) : point;
}

type FocusAim = {
  focus: string;
  layout: Layout;
  floor: number;
  exploded: boolean;
  fly: Fly;
  takeOver: (long?: boolean) => void;
  setFloor: (floor: number) => void;
};

/** The page's focus (overview, a zone or an agent) drives the camera; focusing an agent switches to its floor. */
export function useFocusCamera(aim: FocusAim) {
  const firstFocus = useRef(true);
  const now = useRef(aim);
  now.current = aim;
  useEffect(() => {
    // Only a change of focus drives the camera, not a floor or layout edit.
    const { focus, layout, floor, exploded, fly, takeOver, setFloor } = now.current;
    if (!firstFocus.current && focus !== 'overview') takeOver(true);
    firstFocus.current = false;
    const seat = layout.objects.find((o) => o.agentId === focus);
    const zone = zones.find((z) => z.id === focus);
    if (seat) {
      const f = seat.floor ?? 0;
      setFloor(f);
      fly([seat.x, floorY(f, exploded) + 0.7, seat.z], AGENT_OFFSET);
    } else if (zone) fly([zone.x, floorY(floor, exploded), zone.z], ZONE_OFFSET);
    else fly([0, lookY(floor, exploded), 0], OVERVIEW(exploded));
  }, [aim.focus]);
}

type SeatAim = {
  seats: Seats;
  exploded: boolean;
  fly: Fly;
  takeOver: (long?: boolean) => void;
  setFloor: (floor: number) => void;
  userChoseFloor: RefObject<boolean>;
};

/** Follow: the camera flies to the member and then keeps it in frame (SceneCamera tracks `followPoint`). */
export function useFollow(
  { seats, exploded, fly, takeOver, setFloor, userChoseFloor }: SeatAim,
  following: string | null,
  setFollowing: (id: string | null) => void,
) {
  const follow = useCallback(
    (id: string | null) => {
      const seat = id ? seats.get(id) : undefined;
      if (!id || !seat) return setFollowing(null);
      userChoseFloor.current = true;
      setFloor(seat.floor);
      fly([seat.x, floorY(seat.floor, exploded) + 0.7, seat.z], FOLLOW_OFFSET);
      setFollowing(id);
      takeOver(true);
    },
    [seats, exploded, fly, takeOver, setFloor, setFollowing, userChoseFloor],
  );
  const seat = following ? seats.get(following) : undefined;
  const followPoint: V3 | null = seat ? [seat.x, floorY(seat.floor, exploded) + 0.7, seat.z] : null;
  return { follow, followPoint };
}

/** A close-up of the member's monitor, from the sitter's side (the camera keeps the controls' minimum distance). */
export function useLookAtScreen({
  seats,
  exploded,
  fly,
  takeOver,
  setFloor,
  userChoseFloor,
}: SeatAim) {
  return useCallback(
    (id: string) => {
      const target = seatWorld(seats, exploded, id, [0, SEATING.screenY, -0.3]);
      const offset = seatWorld(seats, exploded, id, [0.55, 0.45, 3.9], true);
      const seat = seats.get(id);
      if (!target || !offset || !seat) return;
      userChoseFloor.current = true;
      setFloor(seat.floor);
      fly(target, offset);
      takeOver(true);
    },
    [seats, exploded, fly, takeOver, setFloor, userChoseFloor],
  );
}
