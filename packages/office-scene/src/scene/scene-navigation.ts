import { useCallback, useMemo, useRef } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import type { Pulse, Seat } from '../environment/director.js';
import type { IntroTour } from '../intro/use-intro-tour.js';
import { useSceneKeys } from './scene-keys.js';
import { useFloorCamera } from '../core/use-floor-camera.js';
import { useTakeOver } from '../core/use-take-over.js';
import { useDirector } from '../core/use-director.js';
import { useFocusCamera, useFollow, useLookAtScreen } from '../core/use-camera-aims.js';

export type { Directed } from '../core/use-director.js';

function seatsOf(layout: Layout) {
  const map = new Map<string, Seat>();
  for (const o of layout.objects)
    if (o.agentId)
      map.set(o.agentId, { x: o.x, z: o.z, floor: o.floor ?? 0, rotation: o.rotation });
  return map;
}

type NavigationOptions = {
  agents: readonly Agent[];
  layout: Layout;
  focus: string;
  onUserCamera: (() => void) | undefined;
  onToggleAuto?: (() => void) | undefined;
  pulses: readonly Pulse[];
  attention: ReadonlyMap<string, string>;
  intensity: ReadonlyMap<string, number>;
  directing: boolean;
  resumeMs: number;
  selectedId: string | null;
  intro?: IntroTour | undefined;
};

function useHands(o: NavigationOptions, setFollowing: (id: string | null) => void) {
  return useTakeOver({
    resumeMs: o.resumeMs,
    selectedId: o.selectedId,
    setFollowing,
    interruptIntro: o.intro?.interrupt,
    onUserCamera: o.onUserCamera,
  });
}

function useNavigationKeys(
  view: ReturnType<typeof useFloorCamera>,
  hands: ReturnType<typeof useTakeOver>,
  onToggleAuto: (() => void) | undefined,
) {
  const keys = useRef(new Set<string>());
  const { floor, exploded, goToFloor, setExploded } = view;
  const { setPaused } = hands;
  const toggleFollow = useCallback(() => {
    setPaused(false);
    onToggleAuto?.();
  }, [setPaused, onToggleAuto]);
  const toggleExploded = useCallback(() => {
    setExploded(!exploded);
    goToFloor(floor, !exploded);
  }, [setExploded, exploded, floor, goToFloor]);
  const goToFloorKey = useCallback((next: number) => goToFloor(next), [goToFloor]);
  useSceneKeys(keys, {
    floor,
    onFloor: goToFloorKey,
    onToggleFollow: toggleFollow,
    onToggleExploded: toggleExploded,
    onCamera: hands.userCamera,
  });
  return { keys, toggleFollow, toggleExploded };
}

export function useSceneNavigation(o: NavigationOptions) {
  const { agents, layout, focus, intro } = o;
  const view = useFloorCamera(agents, layout, intro);
  const { floor, exploded, following, fly, goToFloor, setFloor, setExploded } = view;
  const seats = useMemo(() => seatsOf(layout), [layout]);
  const hands = useHands(o, view.setFollowing);
  const running = o.directing && !hands.paused && !following && !intro?.active;
  const { pulses, attention, intensity } = o;
  const directed = useDirector({ agents, seats, pulses, attention, intensity }, running, view);
  const { takeOver } = hands;
  const aim = { seats, exploded, fly, takeOver, setFloor, userChoseFloor: view.userChoseFloor };
  useFocusCamera({ focus, layout, floor, exploded, fly, takeOver, setFloor });
  const { follow, followPoint } = useFollow(aim, following, view.setFollowing);
  const lookAtScreen = useLookAtScreen(aim);

  const { keys, toggleFollow, toggleExploded } = useNavigationKeys(view, hands, o.onToggleAuto);

  return {
    keys,
    floor,
    exploded,
    command: view.command,
    directed,
    seats,
    paused: hands.paused,
    perFloor: view.perFloor,
    following,
    follow,
    lookAtScreen,
    followPoint,
    pause: hands.pause,
    fly,
    goToFloor,
    toggleFollow,
    toggleExploded,
    userCamera: hands.userCamera,
    showFloor: (next: number) => {
      setExploded(false);
      goToFloor(next, false);
    },
  };
}
