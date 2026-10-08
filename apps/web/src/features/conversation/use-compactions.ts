import { useEffect, useRef, useState } from 'react';
import { COMPACTION_LIVE_MS, type SceneCompaction } from '@aether/office-scene/model';
import {
  NEW_TRACKER,
  observe,
  type ContextReading,
  type Tracker,
} from '../conversation/compaction.js';

/**
 * The compactions happening now, by member id, for the scene: each is kept for COMPACTION_LIVE_MS after it is detected
 * (the effect plays once, the chip fades) and then dropped. A tracker per member sees every reading of the session.
 */
export function useCompactions(
  readings: Readonly<Record<string, ContextReading>>,
): Record<string, SceneCompaction> {
  const trackers = useRef(new Map<string, Tracker>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const [live, setLive] = useState<Record<string, SceneCompaction>>({});
  useEffect(() => {
    const now = Date.now();
    for (const [id, reading] of Object.entries(readings)) {
      const step = observe(trackers.current.get(id) ?? NEW_TRACKER, { at: now, ...reading });
      trackers.current.set(id, step.tracker);
      const event = step.event;
      if (!event) continue;
      setLive((prev) => ({ ...prev, [id]: event }));
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        setLive((prev) => {
          if (prev[id]?.key !== event.key) return prev;
          return Object.fromEntries(Object.entries(prev).filter(([key]) => key !== id));
        });
      }, COMPACTION_LIVE_MS);
      timers.current.add(timer);
    }
    for (const id of trackers.current.keys()) if (!(id in readings)) trackers.current.delete(id);
  }, [readings]);
  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach(clearTimeout);
  }, []);
  return live;
}
