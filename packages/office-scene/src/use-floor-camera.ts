import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import { FLOORS } from './layout.js';
import { busiestFloor, floorCounts } from './floor-counts.js';
import type { IntroTour } from './intro/use-intro-tour.js';
import type { FlyTo } from './SceneCamera.js';
import { OVERVIEW, lookY } from './scene-geometry.js';

/**
 * The floor in view, the exploded view and the camera's flights: the floor starts on the busiest one, the first-visit tour
 * drives both while it plays, and every flight (to a floor, a zone, a desk) goes through `fly`.
 */
export function useFloorCamera(
  agents: readonly Agent[],
  layout: Layout,
  intro: IntroTour | undefined,
) {
  const [floor, setFloor] = useState(0);
  const [exploded, setExploded] = useState(false);
  const [command, setCommand] = useState<FlyTo>({
    id: 0,
    target: [0, 0, 0],
    offset: OVERVIEW(false),
  });
  const [following, setFollowing] = useState<string | null>(null);
  const sequence = useRef(0);
  const perFloor = useMemo(() => floorCounts(agents, layout), [agents, layout]);

  // Any other flight (a floor, a zone, a double click) ends a follow; `follow` sets it again after its own.
  const fly = useCallback((target: [number, number, number], offset: [number, number, number]) => {
    sequence.current += 1;
    setFollowing(null);
    setCommand({ id: sequence.current, target, offset });
  }, []);

  // Start on the busiest floor (most work, then most members) until the user picks one themselves.
  const userChoseFloor = useRef(false);
  const view = useRef({ floor, exploded });
  view.current = { floor, exploded };
  useEffect(() => {
    if (userChoseFloor.current) return;
    const best = busiestFloor(perFloor); // only the head count decides the starting floor
    if (best !== null && best !== view.current.floor) {
      setFloor(best);
      fly([0, lookY(best, view.current.exploded), 0], OVERVIEW(view.current.exploded));
    }
  }, [perFloor, fly]);

  // The tour sets the floor and the exploded view while it plays, and what it leaves is the person's from then on.
  const driveFloor = intro?.drive?.floor;
  const driveExploded = intro?.drive?.exploded;
  useEffect(() => {
    if (driveFloor === undefined || driveExploded === undefined) return;
    userChoseFloor.current = true;
    setFloor(driveFloor);
    setExploded(driveExploded);
  }, [driveFloor, driveExploded]);

  const goToFloor = useCallback(
    (next: number, isExploded = exploded) => {
      userChoseFloor.current = true;
      const clamped = Math.min(FLOORS - 1, Math.max(0, next));
      setFloor(clamped);
      fly([0, lookY(clamped, isExploded), 0], OVERVIEW(isExploded));
    },
    [exploded, fly],
  );

  return {
    floor,
    setFloor,
    exploded,
    setExploded,
    command,
    following,
    setFollowing,
    perFloor,
    fly,
    goToFloor,
    userChoseFloor,
  };
}
