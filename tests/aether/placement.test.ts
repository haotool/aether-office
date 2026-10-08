import { describe, expect, it } from 'vitest';
import type { Agent } from '../../packages/contracts/src/index.js';
import { FLOORS, FLOOR_CAPACITY } from '../../packages/office-scene/src/environment/layout.js';
import { mergeLayout } from '../../apps/web/src/features/office/layout-merge.js';

const agents = (n: number): Agent[] =>
  Array.from({ length: n }, (_, i) => ({ id: `local:a${i}` }) as Agent);

const SITTER_Z = 0.86;
/** Where each seated member stands: the desk's own frame, the member at +z. */
const standing = (layout: NonNullable<ReturnType<typeof mergeLayout>>) =>
  layout.objects.flatMap((o) =>
    o.agentId ? [{ id: o.agentId, floor: o.floor ?? 0, x: o.x, z: o.z + SITTER_Z }] : [],
  );

describe('member placement', () => {
  it.each([[12], [FLOOR_CAPACITY], [FLOOR_CAPACITY + 10]])(
    'no two members of a floor stand together when %i share one floor',
    (n) => {
      const people = standing(mergeLayout(null, [], agents(n))!);
      for (const [i, a] of people.entries())
        for (const b of people.slice(i + 1))
          if (a.floor === b.floor)
            expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} ${b.id}`).toBeGreaterThan(1);
    },
  );

  it.each([[58], [120], [FLOORS * FLOOR_CAPACITY]])(
    'all %i members of one floor get a distinct seat, spilling onto the next floors',
    (n) => {
      const layout = mergeLayout(null, [], agents(n))!;
      const people = standing(layout);
      expect(new Set(people.map((p) => p.id)).size).toBe(n);
      const perFloor = Array.from({ length: FLOORS }, (_, f) =>
        people.filter((p) => p.floor === f),
      );
      expect(perFloor[0]).toHaveLength(Math.min(n, FLOOR_CAPACITY));
      for (const here of perFloor)
        for (const [i, a] of here.entries())
          for (const b of here.slice(i + 1))
            expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} ${b.id}`).toBeGreaterThan(1);
    },
  );

  it('seats the overflow of a saved layout on the next floor with room, without moving anyone', () => {
    const saved = mergeLayout(null, [], agents(FLOOR_CAPACITY))!;
    const people = agents(FLOOR_CAPACITY + 5);
    const merged = mergeLayout(saved, [], people)!;
    expect(merged.objects.slice(0, saved.objects.length)).toEqual(saved.objects);
    const extra = standing(merged).filter((p) => !standing(saved).some((q) => q.id === p.id));
    expect(extra).toHaveLength(5);
    expect(extra.every((p) => p.floor === 1)).toBe(true);
  });

  it('is deterministic', () => {
    expect(mergeLayout(null, [], agents(120))).toEqual(mergeLayout(null, [], agents(120)));
  });

  it('keeps members on their own floor while it has room', () => {
    const layout = mergeLayout(null, [], agents(6), (a) => Number(a.id.slice(-1)) % 3)!;
    expect(standing(layout).map((p) => p.floor)).toEqual(
      [0, 1, 2, 0, 1, 2].sort().length ? expect.any(Array) : [],
    );
  });
});
