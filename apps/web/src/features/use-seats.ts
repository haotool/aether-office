import { useEffect, useRef } from 'react';
import type { Agent } from '@aether/contracts';
import { assignSeats, type Seat } from '@aether/office-scene/model';
import { loadSeats, saveSeats, serializeSeats } from '../seat-store.js';

/**
 * The desks of the members in the building: each keeps its desk while it stays, a new arrival takes the first free one, and
 * the desks are remembered per project in the browser so a reload seats the same people where they sat. `agents` are the
 * members that get a desk of their own (the caller leaves out those a squad zone seats). While the list is empty (nothing
 * loaded yet) the remembered desks are kept, not forgotten.
 */
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
  useEffect(() => {
    if (!agents.length || saved.current === `${projectId}${text}`) return;
    saved.current = `${projectId}${text}`;
    saveSeats(projectId, seats);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `text` is `seats`' content
  }, [projectId, text]);
  held.current = { projectId, seats };
  return seats;
}
