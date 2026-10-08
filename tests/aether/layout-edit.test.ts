import { expect, it } from 'vitest';
import type { Layout } from '../../packages/contracts/src/index.js';
import {
  withoutObject,
  withPatchedObject,
} from '../../apps/web/src/features/office/layout-edit.js';

const layout = {
  schemaVersion: 2,
  objects: [
    { id: 'd1', type: 'desk', x: 1, z: 1, rotation: 0, agentId: null, floor: 0 },
    { id: 's1', type: 'squad', x: 2, z: 2, rotation: 0, anchor: 'd1', span: [4, 3], seats: 2 },
    { id: 'p1', type: 'plant', x: 3, z: 3, rotation: 0, agentId: null, floor: 0 },
  ],
} as unknown as Layout;

it('removes an object together with the squad zone anchored to it', () => {
  expect(withoutObject(layout, 'd1').objects.map((o) => o.id)).toEqual(['p1']);
  expect(withoutObject(layout, 'p1').objects.map((o) => o.id)).toEqual(['d1', 's1']);
});

it('patches only the selected object and leaves the input untouched', () => {
  const next = withPatchedObject(layout, 'p1', { x: 9 });
  expect(next.objects.find((o) => o.id === 'p1')?.x).toBe(9);
  expect(next.objects.find((o) => o.id === 'd1')?.x).toBe(1);
  expect(layout.objects.find((o) => o.id === 'p1')?.x).toBe(3);
});
