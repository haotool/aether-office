import { expect, it } from 'vitest';
import {
  gridFor,
  planCarriers,
  positionAt,
} from '../../packages/office-scene/src/environment/carriers.js';
import { defaultLayout } from '../../packages/office-scene/src/environment/layout.js';
import type { Agent } from '../../packages/contracts/src/index.js';

const agents = ['a', 'b', 'c'].map((id) => ({ id }) as Agent);
const layout = defaultLayout(agents);

it('plans one carrier per recipient and never replays a message already seen', () => {
  const message = { id: 'm1', senderId: 'a', recipientIds: ['b', 'c'] };
  const first = planCarriers([message], new Set(), layout);
  expect(first.carriers.map((c) => c.key)).toEqual(['m1:b', 'm1:c']);
  expect(first.carriers.every((c) => c.length > 0)).toBe(true);
  const again = planCarriers([message], first.seen, layout);
  expect(again.carriers).toEqual([]);
});

it('marks history seen without animating (reduced motion or first load) and skips non-agent senders', () => {
  const quiet = planCarriers(
    [{ id: 'm2', senderId: 'a', recipientIds: ['b'] }],
    new Set(),
    layout,
    undefined,
    false,
  );
  expect(quiet.carriers).toEqual([]);
  expect(quiet.seen.has('m2')).toBe(true);
  const human = planCarriers(
    [{ id: 'm3', senderId: 'owner', recipientIds: ['b'] }],
    new Set(),
    layout,
  );
  expect(human.carriers).toEqual([]);
  expect(human.unreachable).toEqual([]);
});

it('reports an unreachable recipient instead of animating through walls', () => {
  const grid = gridFor(layout);
  grid.blocked.fill(1);
  const plan = planCarriers(
    [{ id: 'm4', senderId: 'a', recipientIds: ['b'] }],
    new Set(),
    layout,
    grid,
  );
  expect(plan.carriers).toEqual([]);
  expect(plan.unreachable).toEqual([{ messageId: 'm4', recipientId: 'b' }]);
  expect(plan.seen.has('m4')).toBe(true);
});

it('positions a carrier along a polyline and clamps at the end', () => {
  const line = [
    { x: 0, z: 0 },
    { x: 4, z: 0 },
    { x: 4, z: 3 },
  ];
  expect(positionAt(line, 2)).toEqual({ x: 2, z: 0 });
  expect(positionAt(line, 5)).toEqual({ x: 4, z: 1 });
  expect(positionAt(line, 99)).toEqual({ x: 4, z: 3 });
});
