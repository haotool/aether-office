import { describe, expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import { objectBounds } from '../../packages/kernel/src/index.js';
import { mergeLayout } from '../../apps/web/src/features/office/layout-merge.js';
import {
  EMPTY_SQUAD,
  stepSquad,
  type SquadInput,
} from '../../packages/office-scene/src/squad/squad-model.js';
import {
  isPodSeat,
  placeZones,
  podSeats,
  withPodSeats,
} from '../../packages/office-scene/src/squad/squad-seats.js';

const agent = (id: string): Agent =>
  ({ id, projectId: 'p', name: id, activity: 'working', species: 'fox', color: '#fff' }) as Agent;
const parent = agent('local:s1');

function both(count: number, others = 0) {
  const subs = Array.from({ length: count }, (_, n) => agent(`local:s1:sub:a${n}`));
  const rest = Array.from({ length: others }, (_, n) => agent(`local:o${n}`));
  const layout = mergeLayout(null, [], [parent, ...rest, ...subs], () => 0, { squads: true })!;
  const input: SquadInput[] = [
    {
      supervisor: parent.id,
      members: subs.map((s) => ({
        id: s.id,
        type: 'Explore',
        status: 'running' as const,
        startedAt: 0,
        lastSeen: 0,
        toolCount: 0,
      })),
    },
  ];
  const state = stepSquad(EMPTY_SQUAD, { squads: input, leaveMs: () => 1 }, 1000);
  const zones = placeZones(layout, state, [parent.id]);
  return { layout, subs, state, zones };
}

describe('the page and the scene agree about squads', () => {
  it.each([1, 2, 3, 4, 5, 8, 12])(
    'for %i subagents the scene has a zone exactly when the page gave them no desks',
    (n) => {
      const { layout, subs, zones, state } = both(n);
      const withDesks = subs.filter((s) => layout.objects.some((o) => o.agentId === s.id));
      expect(withDesks.length === 0 || withDesks.length === n).toBe(true);
      expect(zones).toHaveLength(withDesks.length === 0 ? 1 : 0);
      if (zones.length) {
        expect(zones[0]!.pods.length).toBeGreaterThanOrEqual(n);
        expect(podSeats(zones, state, 1000)).toHaveLength(n);
      }
    },
  );

  it('never lets a zone overlap a desk', () => {
    const { layout, zones } = both(6, 6);
    const rect = zones[0]!.rect;
    for (const o of layout.objects.filter((o) => (o.floor ?? 0) === rect.floor)) {
      const b = objectBounds(o);
      const overlaps =
        b.minX < rect.x + rect.width / 2 &&
        b.maxX > rect.x - rect.width / 2 &&
        b.minZ < rect.z + rect.depth / 2 &&
        b.maxZ > rect.z - rect.depth / 2;
      expect(overlaps).toBe(false);
    }
  });

  it('adds the pod seats to a copy only, marked so the scene can tell them from desks', () => {
    const { layout, zones, state } = both(3);
    const seats = podSeats(zones, state, 1000);
    const seated = withPodSeats(layout, seats);
    expect(seated.objects.filter(isPodSeat)).toHaveLength(3);
    expect(layout.objects.some(isPodSeat)).toBe(false);
    expect(seated.objects.filter((o) => !isPodSeat(o))).toEqual(layout.objects);
  });
});
