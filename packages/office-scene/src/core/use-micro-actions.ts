import { useEffect, useRef, type Dispatch, type SetStateAction } from 'react';
import type { Agent } from '@aether/contracts';
import type { ClipName } from '../animals/animal-states.js';
import { COOLDOWN, microAction, type WorkMode } from '../environment/behavior.js';

/** What the director needs to know about the member's desk and work (see behavior.ts). */
export type BehaviorScene = {
  mode: WorkMode;
  intensity: 0 | 1 | 2 | 3;
  secondMonitor: boolean;
  /** Whole minutes since anything happened in its session; null when not known. */
  quietMinutes: number | null;
};

/**
 * Schedules a member's small actions: after the director's wait the action plays once over the base clip (`play`), and a
 * pause in typing is cut short after its hold. Idle while `busy` (an action is already playing) or `enabled` is false.
 */
export function useMicroActions({
  enabled,
  busy,
  activity,
  seed,
  species,
  scene,
  play,
}: {
  enabled: boolean;
  busy: boolean;
  activity: Agent['activity'];
  seed: string;
  species: string;
  scene: BehaviorScene;
  play: Dispatch<SetStateAction<ClipName | null>>;
}) {
  const count = useRef(0);
  const recent = useRef<ClipName[]>([]);
  const hold = useRef<ReturnType<typeof setTimeout>>(undefined);
  const { mode, intensity, secondMonitor, quietMinutes } = scene;
  useEffect(() => {
    if (!enabled || busy) return;
    const next = microAction({
      activity,
      mode,
      seed,
      n: count.current,
      intensity,
      species,
      secondMonitor,
      quietMinutes,
      recent: recent.current,
    });
    if (!next) return;
    const timer = setTimeout(() => {
      count.current += 1;
      recent.current = [...recent.current.slice(-(COOLDOWN - 1)), next.clip];
      play(next.clip);
      if (next.holdMs)
        hold.current = setTimeout(
          () => play((now) => (now === next.clip ? null : now)),
          next.holdMs,
        );
    }, next.waitMs);
    return () => clearTimeout(timer);
  }, [enabled, busy, activity, seed, species, mode, intensity, secondMonitor, quietMinutes, play]);
  useEffect(() => () => clearTimeout(hold.current), []);
}
