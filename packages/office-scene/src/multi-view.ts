import type { Agent } from '@aether/contracts';
import type { Seat, Shot } from './director.js';

/**
 * Picture-in-picture: when several members are busy at once the main camera can only be on one of them, so the others
 * get a small live view each (a closeup at their desk) beside it. Which ones: the busiest working members the main shot
 * is not already on. A view that is still earning its place stays, so the wall does not reshuffle every few seconds.
 */
export const MAX_FEEDS = 3;
const WORKING: readonly Agent['activity'][] = [
  'working',
  'reviewing',
  'waiting_permission',
  'waiting_peer',
];
const WEIGHT: Partial<Record<Agent['activity'], number>> = {
  waiting_permission: 3,
  working: 2,
  reviewing: 2,
  waiting_peer: 1,
};

export type Feed = { id: string; shot: Shot };

const hash = (text: string) =>
  [...text].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;

export function chooseFeeds({
  agents,
  seats,
  intensity,
  taken,
  previous,
  max = MAX_FEEDS,
}: {
  agents: readonly Agent[];
  seats: ReadonlyMap<string, Seat>;
  intensity: ReadonlyMap<string, number>;
  /** Members already on the main screen or chosen by the person: not shown twice. */
  taken: ReadonlySet<string>;
  previous: readonly Feed[];
  max?: number;
}): Feed[] {
  const busy = agents
    .filter(
      (a) =>
        (WORKING.includes(a.activity) || (intensity.get(a.id) ?? 0) > 0) &&
        seats.has(a.id) &&
        !taken.has(a.id),
    )
    .map((a) => ({
      agent: a,
      score: (WEIGHT[a.activity] ?? 0) * 10 + (intensity.get(a.id) ?? 0) * 6,
    }))
    .sort((a, b) => b.score - a.score || (a.agent.id < b.agent.id ? -1 : 1));
  // A single busy member is the main shot's business, not a wall's: it takes at least two to need one.
  if (busy.length + taken.size < 2) return [];
  const keep = new Set(previous.map((f) => f.id));
  const chosen = [
    ...busy.filter((b) => keep.has(b.agent.id)),
    ...busy.filter((b) => !keep.has(b.agent.id)),
  ].slice(0, max);
  return chosen.map(({ agent }) => {
    const seat = seats.get(agent.id)!;
    return {
      id: agent.id,
      shot: {
        key: `feed:${agent.id}`,
        kind: 'closeup',
        floor: seat.floor,
        subjects: [agent.id],
        reason: 'working',
        seconds: 12,
        score: 0,
        style: (hash(agent.id) % 3) as 0 | 1 | 2,
      },
    };
  });
}
