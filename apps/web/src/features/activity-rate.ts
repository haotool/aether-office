import { useMemo, useRef } from 'react';
import type { AttributedSession } from '@aether/contracts';

/**
 * How hard a working session is working, from things that were really observed: how often something visibly happened in
 * it over the last minute (a new hook event or transcript write between two looks), how much CPU its process tree uses,
 * and how many subagents are working for it. The office shows it: faster typing, a screen that streams, and at the top a
 * machine that smokes.
 */
export type Intensity = 0 | 1 | 2 | 3;

export const BEAT_WINDOW_MS = 60_000;
const SUBAGENT_LIVE_MS = 20_000;

type Sessions = readonly AttributedSession[];
/** For each session, when it was last seen to change and the moments of its changes within the window. */
export type BeatLog = { seen: Map<string, number>; beats: Map<string, number[]> };

export const newBeatLog = (): BeatLog => ({ seen: new Map(), beats: new Map() });

/** Notes which sessions changed since the last look and returns the changes per minute of each. */
export function recordBeats(log: BeatLog, sessions: Sessions, now: number): Map<string, number> {
  const perMinute = new Map<string, number>();
  for (const s of sessions) {
    const marker = Math.max(s.hook?.at ?? 0, s.mtime);
    const last = log.seen.get(s.key);
    log.seen.set(s.key, marker);
    const times = (log.beats.get(s.key) ?? []).filter((t) => now - t < BEAT_WINDOW_MS);
    if (last !== undefined && marker !== last) times.push(now);
    log.beats.set(s.key, times);
    perMinute.set(s.key, (times.length * 60_000) / BEAT_WINDOW_MS);
  }
  return perMinute;
}

/** 0 when it is not working; 1 working; 2 working hard; 3 flat out. */
export function intensityOf(
  session: AttributedSession,
  working: boolean,
  beatsPerMinute: number,
  now: number,
): Intensity {
  if (!working) return 0;
  const cpu = session.resources?.cpuPercent ?? 0;
  const helpers = session.subagents.filter((c) => now - c.lastSeen < SUBAGENT_LIVE_MS).length;
  const load = beatsPerMinute / 6 + cpu / 50 + helpers;
  return load >= 2.5 ? 3 : load >= 1 ? 2 : 1;
}

/** The changes per minute of every session, kept across renders. */
export function useBeats(sessions: Sessions | undefined): ReadonlyMap<string, number> {
  const log = useRef(newBeatLog());
  // Pure in effect: looking twice at the same list records nothing the second time.
  return useMemo(() => recordBeats(log.current, sessions ?? [], Date.now()), [sessions]);
}
