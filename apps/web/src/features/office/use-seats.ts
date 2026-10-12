import { useEffect, useRef } from 'react';
import type { Agent } from '@aether/contracts';
import { assignSeats, type Seat } from '@aether/office-scene/model';
import { useLatest } from '../../hooks/use-latest.js';
import { loadSeats, saveSeats, serializeSeats } from './seat-store.js';

export function useSeats(
  projectId: string,
  agents: readonly Agent[],
  floorOf: (agent: Agent) => number,
): ReadonlyMap<string, Seat> {
  const held = useRef<{ projectId: string; seats: ReadonlyMap<string, Seat> } | null>(null);
  if (held.current?.projectId !== projectId)
    held.current = { projectId, seats: loadSeats(projectId) };
  const seats = agents.length
    ? assignSeats(held.current.seats, agents, floorOf)
    : held.current.seats;
  const text = serializeSeats(seats);
  const saved = useRef('');
  const now = useLatest({ seated: agents.length > 0, seats });
  useEffect(() => {
    if (!now.current.seated || saved.current === `${projectId}${text}`) return;
    saved.current = `${projectId}${text}`;
    saveSeats(projectId, now.current.seats);
  }, [projectId, text, now]);
  held.current = { projectId, seats };
  return seats;
}
