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

function useNavigationKeys(
  view: ReturnType<typeof useFloorCamera>,
  hands: ReturnType<typeof useTakeOver>,
  toggleFollow: () => void,
) {
  const { floor, exploded, goToFloor, setExploded } = view;
  const keys = useRef(new Set<string>());
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

  return { keys, toggleExploded };
}

export function useSceneNavigation(o: NavigationOptions) {
  const { agents, layout, focus, intro, pulses, attention, intensity } = o;
  const view = useFloorCamera(agents, layout, intro);
  const { floor, exploded, following, fly, goToFloor, setFloor, setExploded } = view;
  const seats = useMemo(() => seatsOf(layout), [layout]);
  const hands = useTakeOver({
    ...o,
    setFollowing: view.setFollowing,
    interruptIntro: intro?.interrupt,
  });
  const running = o.directing && !hands.paused && !following && !intro?.active;
  const toggleFollow = useCallback(() => {
    if (!o.directing || running) o.onToggleAuto?.();
    view.setFollowing(null);
    intro?.interrupt();
    hands.setPaused(false);
  }, [o.directing, o.onToggleAuto, running, view.setFollowing, intro?.interrupt, hands.setPaused]);
  const directed = useDirector({ agents, seats, pulses, attention, intensity }, running, view);
  const { takeOver } = hands;
  const aim = { seats, exploded, fly, takeOver, setFloor, userChoseFloor: view.userChoseFloor };
  useFocusCamera({ focus, layout, floor, exploded, fly, takeOver, setFloor });
  const { follow, followPoint } = useFollow(aim, following, view.setFollowing);
  const lookAtScreen = useLookAtScreen(aim);

  const { keys, toggleExploded } = useNavigationKeys(view, hands, toggleFollow);

  return {
    keys,
    floor,
    exploded,
    command: view.command,
    directed,
    seats,
    running,
    perFloor: view.perFloor,
    following,
    follow,
    lookAtScreen,
    followPoint,
    pause: hands.pause,
    fly,
    toggleFollow,
    toggleExploded,
    userCamera: hands.userCamera,
    showFloor: (next: number) => {
      setExploded(false);
      goToFloor(next, false);
    },
  };
}
