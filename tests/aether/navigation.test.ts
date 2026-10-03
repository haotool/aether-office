import { expect, it } from 'vitest';
import {
  buildNavGrid,
  findPath,
  pathLength,
  objectBounds,
  type PlacedObject,
} from '../../packages/kernel/src/index.js';
import { defaultLayout } from '../../packages/office-scene/src/layout.js';
import type { Agent } from '../../packages/contracts/src/index.js';

const agents = Array.from({ length: 12 }, (_, i) => ({ id: `a${i}` }) as Agent);
const desks = defaultLayout(agents).objects;

function assertWalkable(objects: readonly PlacedObject[], points: { x: number; z: number }[]) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    for (let s = 0; s <= 40; s++) {
      const x = a.x + ((b.x - a.x) * s) / 40;
      const z = a.z + ((b.z - a.z) * s) / 40;
      for (const o of objects) {
        const box = objectBounds(o);
        expect(
          x > box.minX && x < box.maxX && z > box.minZ && z < box.maxZ,
          `${o.id} at ${x},${z}`,
        ).toBe(false);
      }
    }
  }
}

it('finds a path between every pair of seated agents that never crosses furniture', () => {
  const grid = buildNavGrid(desks);
  const seats = desks.filter((o) => o.agentId);
  for (const from of seats)
    for (const to of seats) {
      if (from === to) continue;
      const result = findPath(grid, from, to);
      expect(result.status, `${from.id}->${to.id}`).toBe('ok');
      if (result.status === 'ok') assertWalkable(desks, result.points);
    }
});

it('detours around a blocking object and is deterministic', () => {
  const wall: PlacedObject[] = [
    { id: 'sofa', type: 'sofa', x: 0, z: 0, rotation: 1, agentId: null },
  ];
  const grid = buildNavGrid(wall);
  const a = findPath(grid, { x: 0, z: -5 }, { x: 0, z: 5 });
  expect(a).toEqual(findPath(grid, { x: 0, z: -5 }, { x: 0, z: 5 }));
  expect(a.status).toBe('ok');
  if (a.status === 'ok') {
    assertWalkable(wall, a.points);
    expect(pathLength(a.points)).toBeGreaterThanOrEqual(10);
  }
});

it('reports unreachable when a destination is walled in or off the floor', () => {
  const ring: PlacedObject[] = [
    { id: 'n', type: 'table', x: 0, z: -1.6, rotation: 0, agentId: null },
    { id: 's', type: 'table', x: 0, z: 1.6, rotation: 0, agentId: null },
    { id: 'w', type: 'table', x: -2.2, z: 0, rotation: 1, agentId: null },
    { id: 'e', type: 'table', x: 2.2, z: 0, rotation: 1, agentId: null },
  ];
  const grid = buildNavGrid(ring, { clearance: 0.6 });
  expect(findPath(grid, { x: 10, z: 10 }, { x: 0, z: 0 }).status).toBe('unreachable');
  expect(findPath(grid, { x: 10, z: 10 }, { x: 80, z: 80 }).status).toBe('unreachable');
});
