import { useCallback, useMemo, useRef, useState } from 'react';
import type { EmoteCue } from '../animals/Animal.js';
import {
  admitPose,
  emptyPoseGate,
  type PoseGate,
  type PoseRequest,
  type PoseTurn,
} from './pose-cues.js';

export type TurnCue = PoseTurn & { at: number };

export type PoseApi = {
  cues: Readonly<Record<string, EmoteCue>>;
  turns: Readonly<Record<string, TurnCue>>;
  request: (request: PoseRequest, now?: number) => boolean;
};

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
