import { useCallback, useMemo, useRef } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import type { Pulse, Seat } from './director.js';
import type { IntroTour } from './intro/use-intro-tour.js';
import { useSceneKeys } from './scene-keys.js';
import { useFloorCamera } from './use-floor-camera.js';
import { useTakeOver } from './use-take-over.js';
import { useDirector } from './use-director.js';
import { useFocusCamera, useFollow, useLookAtScreen } from './use-camera-aims.js';

export type { Directed } from './use-director.js';

/** Each member's seat by id: where the camera, the director and the labels find them. */
function seatsOf(layout: Layout) {
  const map = new Map<string, Seat>();
  for (const o of layout.objects)
    if (o.agentId)
      map.set(o.agentId, { x: o.x, z: o.z, floor: o.floor ?? 0, rotation: o.rotation });
  return map;
}

/**
 * Where the camera is and which floor is shown: the floor (the busiest one at first), the exploded view, flights to a
 * desk, a zone or a floor, the close-up tour of active members, and the keyboard. Anything the user does with the camera
 * ends the tour and is reported through `onUserCamera`.
 */
export function useSceneNavigation({
  agents,
  layout,
  focus,
  onUserCamera,
  onToggleAuto,
  pulses,
  attention,
  intensity,
  directing,
  resumeMs,
  selectedId,
  intro,
}: {
  agents: readonly Agent[];
  layout: Layout;
  focus: string;
  onUserCamera: (() => void) | undefined;
  /** Switches the director on or off (the setting lives with the preferences). */
  onToggleAuto?: (() => void) | undefined;
  /** Messages and subagent work, for the director to cut to. */
  pulses: readonly Pulse[];
  /** Members that want a person, by id with the reason (see the director). */
  attention: ReadonlyMap<string, string>;
  /** How hard each working member works, for the director. */
  intensity: ReadonlyMap<string, number>;
  /** The director is switched on (and motion is allowed). */
  directing: boolean;
  /** How long the camera stays the person's after their last touch before the director takes it back. */
  resumeMs: number;
  selectedId: string | null;
  /** The first-visit tour: while it is active the director waits and the tour sets the floor and the exploded view. */
  intro?: IntroTour | undefined;
}) {
  const keys = useRef(new Set<string>());
  const view = useFloorCamera(agents, layout, intro);
  const { floor, exploded, following, fly, goToFloor, setFloor, setExploded } = view;
  const seats = useMemo(() => seatsOf(layout), [layout]);
  const hands = useTakeOver({
    resumeMs,
    selectedId,
    setFollowing: view.setFollowing,
    interruptIntro: intro?.interrupt,
    onUserCamera,
  });
  // Following a member is the person's choice of shot: the director yields until it ends.
  const running = directing && !hands.paused && !following && !intro?.active;
  const directed = useDirector({ agents, seats, pulses, attention, intensity }, running, view);
  const { takeOver } = hands;
  const aim = { seats, exploded, fly, takeOver, setFloor, userChoseFloor: view.userChoseFloor };
  useFocusCamera({ focus, layout, floor, exploded, fly, takeOver, setFloor });
  const { follow, followPoint } = useFollow(aim, following, view.setFollowing);
  const lookAtScreen = useLookAtScreen(aim);

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

  return {
    keys,
    floor,
    exploded,
    command: view.command,
    /** The shot being played, or null when the camera is the person's. */
    directed,
    seats,
    paused: hands.paused,
    perFloor: view.perFloor,
    following,
    follow,
    lookAtScreen,
    /** Where the camera keeps looking while a member is followed. */
    followPoint,
    pause: hands.pause,
    fly,
    goToFloor,
    toggleFollow,
    toggleExploded,
    userCamera: hands.userCamera,
    /** The floor switcher's choice: leaves the exploded view and flies to that floor. */
    showFloor: (next: number) => {
      setExploded(false);
      goToFloor(next, false);
    },
  };
}
