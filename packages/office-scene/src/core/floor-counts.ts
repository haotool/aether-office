import type { Agent, Layout } from '@aether/contracts';
import { FLOORS } from '../environment/layout.js';
import { floorOfDesk } from '../scene/scene-geometry.js';
import type { FloorCount } from '../components/SceneHud.js';

export function floorCounts(agents: readonly Agent[], layout: Layout): FloorCount[] {
  const counts = Array.from({ length: FLOORS }, () => ({ total: 0, working: 0 }));
  for (const agent of agents) {
    const entry = counts[Math.min(FLOORS - 1, floorOfDesk(layout, agent.id))];
    if (!entry) continue;
    entry.total++;
    if (['working', 'reviewing'].includes(agent.activity)) entry.working++;
  }
  return counts;
}

export function busiestFloor(counts: readonly FloorCount[]): number | null {
  let best: number | null = null;
  let score = 0;
  counts.forEach((entry, i) => {
    const s = entry.working * 1000 + entry.total;
    if (s > score) [best, score] = [i, s];
  });
  return best;
}
