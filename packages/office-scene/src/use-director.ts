import { useCallback, useEffect, useRef, useState } from 'react';
import type { Agent } from '@aether/contracts';
import { PULSE_WINDOW_MS, chooseShot, type Pulse, type Seat, type Shot } from './director.js';
import { chooseEntry } from './shot-camera.js';

/** The shot on screen, when it began, and how the camera came to it: a glide from where it was, or a hard cut. */
export type Directed = { shot: Shot; startedAt: number; entry: 'cut' | 'fly' };
/** A shot is never cut short by a message sooner than this: two cuts in a breath is what makes people dizzy. */
const MIN_HOLD_MS = 5000;

type Inputs = {
  agents: readonly Agent[];
  seats: ReadonlyMap<string, Seat>;
  pulses: readonly Pulse[];
  attention: ReadonlyMap<string, string>;
  intensity: ReadonlyMap<string, number>;
};

type Stage = {
  setFloor: (floor: number) => void;
  setExploded: (exploded: boolean) => void;
};

/**
 * The director: shot after shot, with no one at the controls. It cuts to whoever is talking, waiting on a person, in
 * error or working, and sweeps a floor when nothing is going on. A touch of the camera, a chosen member or a focus
 * request hands it over to the person (`running` is false); after a quiet spell the page takes it back.
 */
export function useDirector(inputs: Inputs, running: boolean, { setFloor, setExploded }: Stage) {
  const [directed, setDirected] = useState<Directed | null>(null);
  const latest = useRef(inputs);
  latest.current = inputs;
  const shown = useRef(new Map<string, number>());
  const playing = useRef<Directed | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const cut = useCallback(() => {
    clearTimeout(timer.current);
    const now = Date.now();
    const previous = playing.current?.shot ?? null;
    const next = chooseShot({ ...latest.current, now, shown: shown.current, previous });
    // A glide only between shots that are near each other; anything else is a hard cut (the camera is not asked to
    // fly across the building). With no shot before it (or the person's hands just off the camera) it is a cut.
    playing.current = next
      ? {
          shot: next,
          startedAt: now,
          entry: chooseEntry(previous, next, latest.current.seats, 1.6),
        }
      : null;
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
  }, [setFloor, setExploded]);

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
  const { pulses } = inputs;
  useEffect(() => {
    const newest = [...pulses].sort((a, b) => b.at - a.at)[0];
    if (!newest || newest.id === lastPulse.current) return;
    lastPulse.current = newest.id;
    const current = playing.current;
    if (!running || Date.now() - newest.at > PULSE_WINDOW_MS) return;
    if (
      current &&
      current.shot.reason !== 'message' &&
      Date.now() - current.startedAt > MIN_HOLD_MS
    )
      cut();
  }, [pulses, running, cut]);

  return directed;
}
