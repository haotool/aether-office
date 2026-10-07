import { useCallback, useMemo, useRef, useState } from 'react';
import type { EmoteCue } from './Animal.js';
import {
  admitPose,
  emptyPoseGate,
  type PoseGate,
  type PoseRequest,
  type PoseTurn,
} from './pose-cues.js';

/** A turn of the chair asked for: how far, for how long, and when (a new `at` starts it again). */
export type TurnCue = PoseTurn & { at: number };

export type PoseApi = {
  /** The clip each member is asked to play (Animal's `emote`). */
  cues: Readonly<Record<string, EmoteCue>>;
  /** The turn each member is asked to hold (Poser's `turn`). */
  turns: Readonly<Record<string, TurnCue>>;
  /** Ask for a pose; true when it was taken (see pose-cues.ts for who wins and what is dropped). */
  request: (request: PoseRequest, now?: number) => boolean;
};

/**
 * The one registry of poses for the scene: the person's emotes, a hand-over's nod and the life effects' gestures all ask
 * here, and the answer is the cue maps the members read. `reducedMotion` drops every request.
 */
export function usePoseCues(reducedMotion: boolean): PoseApi {
  const [cues, setCues] = useState<Readonly<Record<string, EmoteCue>>>({});
  const [turns, setTurns] = useState<Readonly<Record<string, TurnCue>>>({});
  const gate = useRef<PoseGate>(emptyPoseGate);
  const keys = useRef(0);
  const reduced = useRef(reducedMotion);
  reduced.current = reducedMotion;
  const request = useCallback((ask: PoseRequest, now = Date.now()) => {
    const verdict = admitPose(gate.current, ask, now, reduced.current);
    if (!verdict.ok) return false;
    gate.current = verdict.gate;
    const { member, clip, turn } = ask;
    if (clip) setCues((all) => ({ ...all, [member]: { clip, key: ++keys.current } }));
    else if (turn) setTurns((all) => ({ ...all, [member]: { ...turn, at: now } }));
    return true;
  }, []);
  return useMemo(() => ({ cues, turns, request }), [cues, turns, request]);
}
