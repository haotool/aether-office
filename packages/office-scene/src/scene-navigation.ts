import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Agent, Layout } from '@aether/contracts';
import { FLOORS, zones } from './layout.js';
import { PULSE_WINDOW_MS, chooseShot, type Pulse, type Seat, type Shot } from './director.js';
import type { FlyTo } from './SceneCamera.js';
import { useSceneKeys } from './scene-keys.js';
import {
  AGENT_OFFSET,
  OVERVIEW,
  ZONE_OFFSET,
  floorOfDesk,
  floorY,
  lookY,
} from './scene-geometry.js';

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
}) {
  const keys = useRef(new Set<string>());
  const [floor, setFloor] = useState(0);
  const [exploded, setExploded] = useState(false);
  const [command, setCommand] = useState<FlyTo>({
    id: 0,
    target: [0, 0, 0],
    offset: OVERVIEW(false),
  });
  const sequence = useRef(0);

  const perFloor = useMemo(() => {
    const counts = Array.from({ length: FLOORS }, () => ({ total: 0, working: 0 }));
    for (const agent of agents) {
      const entry = counts[Math.min(FLOORS - 1, floorOfDesk(layout, agent.id))]!;
      entry.total++;
      if (['working', 'reviewing'].includes(agent.activity)) entry.working++;
    }
    return counts;
  }, [agents, layout]);

  // Start on the busiest floor (most work, then most members) until the user picks one themselves.
  const userChoseFloor = useRef(false);
  useEffect(() => {
    if (userChoseFloor.current) return;
    let best = -1;
    let score = 0;
    perFloor.forEach((entry, i) => {
      const s = entry.working * 1000 + entry.total;
      if (s > score) [best, score] = [i, s];
    });
    if (best >= 0 && best !== floor) {
      setFloor(best);
      fly([0, lookY(best, exploded), 0], OVERVIEW(exploded));
    }
  }, [perFloor]); // eslint-disable-line react-hooks/exhaustive-deps -- only the head count decides the starting floor

  const fly = useCallback((target: [number, number, number], offset: [number, number, number]) => {
    sequence.current += 1;
    setCommand({ id: sequence.current, target, offset });
  }, []);
  const goToFloor = useCallback(
    (next: number, isExploded = exploded) => {
      userChoseFloor.current = true;
      const clamped = Math.min(FLOORS - 1, Math.max(0, next));
      setFloor(clamped);
      fly([0, lookY(clamped, isExploded), 0], OVERVIEW(isExploded));
    },
    [exploded, fly],
  );

  // The director: shot after shot, with no one at the controls. It cuts to whoever is talking, waiting on a person,
  // in error or working, and sweeps a floor when nothing is going on. A touch of the camera, a chosen member or a
  // focus request hands it over to the person; after `resumeMs` of quiet it takes it back.
  const seats = useMemo(() => {
    const map = new Map<string, Seat>();
    for (const o of layout.objects)
      if (o.agentId)
        map.set(o.agentId, { x: o.x, z: o.z, floor: o.floor ?? 0, rotation: o.rotation });
    return map;
  }, [layout]);
  const [paused, setPaused] = useState(false);
  const [directed, setDirected] = useState<{ shot: Shot; startedAt: number } | null>(null);
  const latest = useRef({ agents, seats, pulses, attention, intensity });
  latest.current = { agents, seats, pulses, attention, intensity };
  const shown = useRef(new Map<string, number>());
  const playing = useRef<{ shot: Shot; startedAt: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const resume = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const running = directing && !paused;

  const cut = useCallback(() => {
    clearTimeout(timer.current);
    const now = Date.now();
    const next = chooseShot({
      ...latest.current,
      now,
      shown: shown.current,
      previous: playing.current?.shot ?? null,
    });
    playing.current = next ? { shot: next, startedAt: now } : null;
    setDirected(playing.current);
    if (!next) {
      timer.current = setTimeout(cut, 4000); // nothing to show yet: look again shortly
      return;
    }
    shown.current.set(next.key, now);
    for (const id of next.subjects) shown.current.set(id, now);
    setExploded(false);
    setFloor(next.floor);
    timer.current = setTimeout(cut, next.seconds * 1000);
  }, []);
  useEffect(() => {
    if (!running) {
      clearTimeout(timer.current);
      playing.current = null;
      setDirected(null);
      return;
    }
    cut();
    return () => clearTimeout(timer.current);
  }, [running, cut]);
  // A message that arrives while something less interesting is on screen is cut to at once (after a beat).
  const lastPulse = useRef('');
  useEffect(() => {
    const newest = [...pulses].sort((a, b) => b.at - a.at)[0];
    if (!newest || newest.id === lastPulse.current) return;
    lastPulse.current = newest.id;
    const current = playing.current;
    if (!running || Date.now() - newest.at > PULSE_WINDOW_MS) return;
    if (current && current.shot.reason !== 'message' && Date.now() - current.startedAt > 2500)
      cut();
  }, [pulses, running, cut]);

  // While a member is chosen the camera stays with the person: it is not taken back from under their reading.
  const chosen = useRef(selectedId);
  chosen.current = selectedId;
  const takeOver = useCallback(
    (long = false) => {
      setPaused(true);
      clearTimeout(resume.current);
      resume.current = setTimeout(
        () => {
          if (!chosen.current) setPaused(false);
        },
        resumeMs * (long ? 2 : 1),
      );
    },
    [resumeMs],
  );
  useEffect(() => () => clearTimeout(resume.current), []);
  const userCamera = useCallback(() => {
    takeOver();
    onUserCamera?.();
  }, [takeOver, onUserCamera]);
  // Choosing a member is the person's doing too.
  const firstSelection = useRef(true);
  useEffect(() => {
    if (firstSelection.current) {
      firstSelection.current = false;
      return;
    }
    if (selectedId) takeOver(true);
    else takeOver(); // let go of the member: the director returns after a quiet spell
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps -- only a change of choice

  // The same focus values as before: overview, a zone or an agent. Focusing an agent switches to its floor.
  const firstFocus = useRef(true);
  useEffect(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- focus changes drive the camera, not floor or layout edits
  }, [focus]);

  const toggleFollow = useCallback(() => {
    setPaused(false);
    onToggleAuto?.();
  }, [onToggleAuto]);
  const toggleExploded = useCallback(() => {
    setExploded(!exploded);
    goToFloor(floor, !exploded);
  }, [exploded, floor, goToFloor]);
  const goToFloorKey = useCallback((next: number) => goToFloor(next), [goToFloor]);
  useSceneKeys(keys, {
    floor,
    onFloor: goToFloorKey,
    onToggleFollow: toggleFollow,
    onToggleExploded: toggleExploded,
    onCamera: userCamera,
  });

  return {
    keys,
    floor,
    exploded,
    command,
    /** The shot being played, or null when the camera is the person's. */
    directed,
    seats,
    paused,
    perFloor,
    fly,
    goToFloor,
    toggleFollow,
    toggleExploded,
    userCamera,
    /** The floor switcher's choice: leaves the exploded view and flies to that floor. */
    showFloor: (next: number) => {
      setExploded(false);
      goToFloor(next, false);
    },
  };
}
