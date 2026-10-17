import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import type { Agent } from '@aether/contracts';
import {
  PULSE_WINDOW_MS,
  chooseShot,
  type Pulse,
  type Seat,
  type Shot,
} from '../environment/director.js';
import { chooseEntry } from './shot-camera.js';

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

const directShot = (
  shot: Shot,
  previous: Shot | null,
  seats: ReadonlyMap<string, Seat>,
  now: number,
): Directed => ({ shot, startedAt: now, entry: chooseEntry(previous, shot, seats, 1.6) });

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
    playing.current = next ? directShot(next, previous, latest.current.seats, now) : null;
    setDirected(playing.current);
    if (!next) {
      timer.current = setTimeout(cut, 4000);
      return;
    }
    shown.current.set(next.key, now);
    if (next.kind !== 'sweep') for (const id of next.subjects) shown.current.set(id, now);
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

  useEffect(() => {
    const shot = playing.current?.shot;
    if (
      running &&
      shot &&
      shot.subjects.some((id) => !inputs.agents.some((a) => a.id === id) || !inputs.seats.has(id))
    )
      cut();
  }, [inputs.agents, inputs.seats, running, cut]);

  useCutOnMessage(inputs.pulses, running, playing, cut);
  return directed;
}

function useCutOnMessage(
  pulses: readonly Pulse[],
  running: boolean,
  playing: RefObject<Directed | null>,
  cut: () => void,
) {
  const lastPulse = useRef('');
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
  }, [pulses, running, playing, cut]);
}
