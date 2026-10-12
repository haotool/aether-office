import { describe, expect, it } from 'vitest';
import * as three from '../../packages/office-scene/node_modules/three/build/three.module.js';
import {
  beadRadii,
  paintBeads,
  placeBeads,
} from '../../packages/office-scene/src/core/stalk-beads.js';
import {
  PALETTE,
  layoutStalk,
  paletteAt,
  type Stalk,
  type StalkCommit,
} from '../../packages/office-scene/src/core/stalk-layout.js';

const { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial } = three;

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;

function forked(): StalkCommit[] {
  const c = (sha: string, parents: string[], age: number): StalkCommit => ({
    sha,
    parents,
    refs: [],
    subject: sha,
    author: 'ada',
    at: NOW - age * DAY,
  });
  return [
    c('m5', ['m4', 'f2'], 0),
    c('f2', ['f1'], 1),
    c('m4', ['m3'], 2),
    c('f1', ['m2'], 3),
    c('m3', ['m2'], 4),
    c('m2', ['m1'], 5),
    c('m1', ['m0'], 6),
    c('m0', [], 7),
  ];
}

const stalk = (): Stalk => {
  const built = layoutStalk(forked(), NOW, 42);
  if (!built) throw new Error('the fixture history lays out no spire');
  return built;
};

function referenceRadii(s: Stalk): number[] {
  const heights = new Map<number, number[]>();
  for (const n of s.nodes) heights.set(n.strand, [...(heights.get(n.strand) ?? []), n.position[1]]);
  for (const list of heights.values()) list.sort((a, b) => a - b);
  return s.nodes.map((n) => {
    const list = heights.get(n.strand)!;
    const at = list.indexOf(n.position[1]);
    const room = Math.min(
      (list[at + 1] ?? Infinity) - n.position[1],
      n.position[1] - (list[at - 1] ?? -Infinity),
    );
    const base = Math.max(0.16, s.strands[n.strand]!.radius * 1.4);
    return Math.max(0.07, Math.min(n.merge ? base * 1.5 : base, room * 0.4));
  });
}

const beads = (s: Stalk) =>
  new InstancedMesh(new IcosahedronGeometry(1, 0), new MeshBasicMaterial(), s.nodes.length);

describe('the spire beads', () => {
  it('sizes every bead as it was sized before the split', () => {
    const s = stalk();
    expect(s.nodes.length).toBeGreaterThan(4);
    expect(beadRadii(s)).toEqual(referenceRadii(s));
  });

  it('paints a bead with its strand colour taken towards white, a merge white', () => {
    const s = stalk();
    const mesh = beads(s);
    paintBeads(mesh, s);
    const expected = new Color();
    s.nodes.forEach((n, i) => {
      expected
        .set(n.merge ? '#ffffff' : PALETTE[n.strand % PALETTE.length]!)
        .lerp(new Color('#ffffff'), n.merge ? 0 : 0.45);
      const got = new Color().fromBufferAttribute(mesh.instanceColor!, i);
      expect([got.r, got.g, got.b].map((v) => Math.fround(v))).toEqual(
        [expected.r, expected.g, expected.b].map((v) => Math.fround(v)),
      );
    });
    expect(mesh.instanceColor!.version).toBeGreaterThan(0);
  });

  it('places the beads up to the reach at their size and leaves the rest without one', () => {
    const s = stalk();
    const radii = beadRadii(s);
    const mesh = beads(s);
    const reach = s.nodes[Math.floor(s.nodes.length / 2)]!.position[1];
    placeBeads(mesh, s, radii, reach);
    const m = new Matrix4();
    s.nodes.forEach((n, i) => {
      mesh.getMatrixAt(i, m);
      const scale = n.position[1] <= reach ? radii[i]! : 0;
      expect(m.elements[0]).toBeCloseTo(scale, 6);
      expect(m.elements[5]).toBeCloseTo(scale, 6);
      expect(m.elements[12]).toBeCloseTo(n.position[0], 5);
      expect(m.elements[13]).toBeCloseTo(n.position[1], 5);
      expect(m.elements[14]).toBeCloseTo(n.position[2], 5);
    });
    expect(mesh.instanceMatrix.version).toBeGreaterThan(0);
  });

  it('goes round the palette for any strand number', () => {
    expect(paletteAt(0)).toBe(PALETTE[0]);
    expect(paletteAt(PALETTE.length + 2)).toBe(PALETTE[2]);
  });
});
