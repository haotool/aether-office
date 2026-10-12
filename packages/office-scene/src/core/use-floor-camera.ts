import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import { FLOORS } from '../environment/layout.js';
import { busiestFloor, floorCounts } from './floor-counts.js';
import type { IntroTour } from '../intro/use-intro-tour.js';
import type { FlyTo } from '../scene/SceneCamera.js';
import { OVERVIEW, lookY } from '../scene/scene-geometry.js';

const OPENING: FlyTo = { id: 0, target: [0, 0, 0], offset: OVERVIEW(false) };

type Setter<T> = (value: T) => void;
type FloorView = RefObject<{ floor: number; exploded: boolean }>;

function useStartFloor(o: {
  perFloor: ReturnType<typeof floorCounts>;
  fly: (target: [number, number, number], offset: [number, number, number]) => void;
  userChoseFloor: RefObject<boolean>;
  view: FloorView;
  setFloor: Setter<number>;
}) {
  const { perFloor, fly, userChoseFloor, view, setFloor } = o;
  useEffect(() => {
    if (userChoseFloor.current) return;
    const best = busiestFloor(perFloor);
    if (best !== null && best !== view.current.floor) {
      setFloor(best);
      fly([0, lookY(best, view.current.exploded), 0], OVERVIEW(view.current.exploded));
    }
  }, [perFloor, fly, userChoseFloor, view, setFloor]);
}

function useTourDrive(
  drive: IntroTour['drive'] | undefined,
  userChoseFloor: RefObject<boolean>,
  setFloor: Setter<number>,
  setExploded: Setter<boolean>,
) {
  const driveFloor = drive?.floor;
  const driveExploded = drive?.exploded;
  useEffect(() => {
    if (driveFloor === undefined || driveExploded === undefined) return;
    userChoseFloor.current = true;
    setFloor(driveFloor);
    setExploded(driveExploded);
  }, [driveFloor, driveExploded, userChoseFloor, setFloor, setExploded]);
}

export function useFloorCamera(
  agents: readonly Agent[],
  layout: Layout,
  intro: IntroTour | undefined,
) {
  const [floor, setFloor] = useState(0);
  const [exploded, setExploded] = useState(false);
  const [command, setCommand] = useState<FlyTo>(OPENING);
  const [following, setFollowing] = useState<string | null>(null);
  const sequence = useRef(0);
  const perFloor = useMemo(() => floorCounts(agents, layout), [agents, layout]);

  const fly = useCallback((target: [number, number, number], offset: [number, number, number]) => {
    sequence.current += 1;
    setFollowing(null);
    setCommand({ id: sequence.current, target, offset });
  }, []);

  const userChoseFloor = useRef(false);
  const view = useRef({ floor, exploded });
  view.current = { floor, exploded };
  useStartFloor({ perFloor, fly, userChoseFloor, view, setFloor });
  useTourDrive(intro?.drive, userChoseFloor, setFloor, setExploded);

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
