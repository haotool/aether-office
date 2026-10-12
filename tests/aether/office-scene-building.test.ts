import { describe, expect, it } from 'vitest';
import * as THREE from '../../packages/office-scene/node_modules/three/build/three.module.js';
import { DEPARTMENTS } from '../../packages/kernel/src/index.js';
import { createMaterials } from '../../packages/office-scene/src/environment/building-materials.js';
import { furniture } from '../../packages/office-scene/src/environment/building-furniture.js';
import {
  cylinder,
  emptyFloorModel,
  ring,
} from '../../packages/office-scene/src/environment/building-parts.js';
import { THEMES } from '../../packages/office-scene/src/environment/building-themes.js';

const materials = () => createMaterials('#43e6df');
const meshesIn = (root: THREE.Object3D) => {
  const found: THREE.Mesh[] = [];
  root.traverse((o) => o instanceof THREE.Mesh && found.push(o));
  return found;
};
const boundsOf = (root: THREE.Object3D) => new THREE.Box3().setFromObject(root);

describe('building parts', () => {
  it('stands a ring flat at the height and place asked for, in the material given', () => {
    const parent = new THREE.Group();
    const m = materials();
    const mesh = ring(m.accent, 3, 0.1, 2, parent, 5, -4);
    expect(parent.children).toEqual([mesh]);
    expect(mesh.position.toArray()).toEqual([5, 2, -4]);
    expect(mesh.material).toBe(m.accent);
    const size = boundsOf(mesh).getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(6.2, 1);
    expect(size.y).toBeLessThan(0.3);
  });

  it('builds a cylinder of the height asked for, closed unless told to be open', () => {
    const parent = new THREE.Group();
    const m = materials();
    const closed = cylinder(parent, m.glass, 1, 1, 3, [0, 1.5, 0], 12);
    const open = cylinder(parent, m.glass, 1, 1, 3, [4, 1.5, 0], 12, true);
    expect(boundsOf(closed).getSize(new THREE.Vector3()).y).toBeCloseTo(3);
    expect(parent.children).toHaveLength(2);
    expect(open.position.x).toBe(4);
    expect(closed.geometry.groups.length).toBe(3);
    expect(open.geometry.groups.length).toBe(1);
  });
});

describe('furniture', () => {
  const TYPES = ['desk', 'rack', 'sofa', 'plant', 'table'] as const;

  it.each(TYPES)(
    '%s adds solid parts that sit on the floor and stay within a few metres',
    (type) => {
      const group = new THREE.Group();
      furniture(group, type as never, materials());
      expect(meshesIn(group).length).toBeGreaterThan(2);
      const box = boundsOf(group);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.5);
      expect(box.max.y).toBeLessThan(4);
      const size = box.getSize(new THREE.Vector3());
      expect(size.x).toBeLessThan(4);
      expect(size.z).toBeLessThan(4);
    },
  );

  it('gives each kind its own look', () => {
    const shapes = TYPES.map((type) => {
      const group = new THREE.Group();
      furniture(group, type as never, materials());
      return `${meshesIn(group).length}:${boundsOf(group)
        .getSize(new THREE.Vector3())
        .toArray()
        .map((n) => n.toFixed(2))
        .join(',')}`;
    });
    expect(new Set(shapes).size).toBe(TYPES.length);
  });

  it('builds a rack as a column of lit storage blocks, all of them in the accent colours', () => {
    const group = new THREE.Group();
    const m = materials();
    furniture(group, 'rack' as never, m);
    const lit = meshesIn(group).filter(
      (mesh) => mesh.material === m.accent || mesh.material === m.cyan,
    );
    expect(lit.length).toBeGreaterThanOrEqual(6);
  });
});

describe('department themes', () => {
  it('has a theme for every department, and no other', () => {
    expect(Object.keys(THEMES).sort()).toEqual(DEPARTMENTS.map((d) => d.id).sort());
  });

  it.each(DEPARTMENTS.map((d) => d.id))(
    '%s dresses a floor with solid furniture and stays on the deck',
    (id) => {
      const root = new THREE.Group();
      const model = emptyFloorModel();
      THEMES[id](root, materials(), model);
      expect(meshesIn(root).length + meshesIn(model.group).length).toBeGreaterThan(5);
      const box = boundsOf(root);
      expect(Number.isFinite(box.min.x + box.max.x + box.min.y + box.max.y)).toBe(true);
      expect(box.min.x).toBeGreaterThan(-30);
      expect(box.max.x).toBeLessThan(30);
      expect(box.min.z).toBeGreaterThan(-22);
      expect(box.max.z).toBeLessThan(22);
      expect(box.max.y).toBeLessThan(8);
    },
  );

  it('builds the same floor twice', () => {
    const build = () => {
      const root = new THREE.Group();
      const model = emptyFloorModel();
      THEMES.quality(root, materials(), model);
      return [
        meshesIn(root).length,
        model.spinners.length,
        model.pulsers.length,
        model.streams.length,
      ];
    };
    expect(build()).toEqual(build());
  });

  it('gives the floors different things', () => {
    const count = (id: keyof typeof THEMES) => {
      const root = new THREE.Group();
      THEMES[id](root, materials(), emptyFloorModel());
      return meshesIn(root).length;
    };
    expect(new Set(DEPARTMENTS.map((d) => count(d.id))).size).toBeGreaterThan(2);
  });
});
