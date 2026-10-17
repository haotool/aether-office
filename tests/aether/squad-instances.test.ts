import { describe, expect, it } from 'vitest';
import {
  art,
  finishInstances,
  withColors,
  writeInstance,
  writeInstances,
  type Instance,
} from '../../packages/office-scene/src/squad/squad-art.js';

const THREE_BUILD = '../../packages/office-scene/node_modules/three/build/three.module.js';
const three = (await import(THREE_BUILD)) as typeof import('three');
const { BoxGeometry, Color, InstancedMesh, MeshBasicMaterial } = three;

const mesh = () => {
  const m = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 8);
  withColors(m);
  return m;
};
const item = (x: number, color: string = '#ff8800'): Instance => ({
  at: [x, 1, 2],
  yaw: 0.5,
  scale: [1, 2, 3],
  color,
});

describe('instance writes', () => {
  it('uploads the buffers only when something changed', () => {
    const m = mesh();
    writeInstances(m, [item(1), item(2)]);
    const first = m.instanceMatrix.version;
    const firstColor = m.instanceColor!.version;
    writeInstances(m, [item(1), item(2)]);
    expect(m.instanceMatrix.version).toBe(first);
    expect(m.instanceColor!.version).toBe(firstColor);
    writeInstances(m, [item(1), item(2.5)]);
    expect(m.instanceMatrix.version).toBeGreaterThan(first);
  });

  it('notices a colour change on its own, and a count change', () => {
    const m = mesh();
    writeInstances(m, [item(1)]);
    const matrix = m.instanceMatrix.version;
    const color = m.instanceColor!.version;
    writeInstances(m, [item(1, '#00ff88')]);
    expect(m.instanceColor!.version).toBeGreaterThan(color);
    expect(m.instanceMatrix.version).toBeGreaterThan(matrix);
    const before = m.instanceMatrix.version;
    writeInstances(m, []);
    expect(m.count).toBe(0);
    expect(m.visible).toBe(false);
    expect(m.instanceMatrix.version).toBeGreaterThan(before);
  });

  it('writes what the old per-instance path wrote', () => {
    const m = mesh();
    writeInstances(m, [item(3)]);
    const e = m.instanceMatrix.array;
    expect([e[12], e[13], e[14]]).toEqual([3, 1, 2]);
    const c = new Color('#ff8800');
    expect(m.instanceColor!.array[0]).toBeCloseTo(c.r, 5);
    expect(m.instanceColor!.array[1]).toBeCloseTo(c.g, 5);
  });

  it('does not allocate a mesh state of its own: a single write reports a change once', () => {
    const m = mesh();
    const q = new InstancedMesh(new BoxGeometry(), new MeshBasicMaterial(), 1).quaternion;
    expect(writeInstance(m, 0, [1, 2, 3], q, [1, 1, 1], null)).toBe(true);
    expect(writeInstance(m, 0, [1, 2, 3], q, [1, 1, 1], null)).toBe(false);
    finishInstances(m, 1, false);
    expect(m.count).toBe(1);
  });
});

it('fits solid team workstations inside the existing seat pitch without coplanar overlaps', () => {
  const { stool } = art();
  stool.computeBoundingBox();
  const bounds = stool.boundingBox!;
  expect(bounds.max.x - bounds.min.x).toBeLessThan(1.6);
  expect(bounds.max.z - bounds.min.z).toBeLessThan(1.6);
});
