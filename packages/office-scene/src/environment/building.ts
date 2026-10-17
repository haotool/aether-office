import * as THREE from 'three';
import type { Layout } from '@aether/contracts';
import { DEPARTMENTS } from '@aether/kernel';
import { box, mergeStatic } from './geometry.js';
import { type Materials, createMaterials } from './building-materials.js';
import { type FloorModel, emptyFloorModel, ring, cylinder } from './building-parts.js';
import { THEMES } from './building-themes.js';
import { furniture } from './building-furniture.js';
import { itemAt } from './checked.js';

export const FLOOR_HEIGHT = 7;
export const EXPLODED_GAP = 11;
const WELL = 1.7;
const CORE_COLLAR = 1.35;

function deck(root: THREE.Group, m: Materials) {
  box(root, m.hull, [54.4, 0.9, 38.4], [0, -0.75, 0], 0.5, WELL);
  box(root, m.slab, [53, 0.3, 37], [0, -0.2, 0], 0.3, WELL);
  box(root, m.deck, [52, 0.14, 36], [0, -0.04, 0], 0.2, WELL);
  for (let x = -24; x <= 24; x += 4) box(root, m.accentSoft, [0.035, 0.012, 35.6], [x, 0.04, 0], 0);
  for (let z = -16; z <= 16; z += 4) box(root, m.accentSoft, [51.6, 0.012, 0.035], [0, 0.04, z], 0);
  for (const x of [-1.15, 1.15]) box(root, m.cyan, [0.07, 0.025, 33], [x, 0.06, 0]);
  for (const z of [-1, 1]) box(root, m.cyan, [50, 0.025, 0.07], [0, 0.06, z]);
  for (const z of [-18.4, 18.4]) box(root, m.accent, [52.6, 0.1, 0.12], [0, -0.55, z], 0.02);
  for (const x of [-26.4, 26.4]) box(root, m.accent, [0.12, 0.1, 37], [x, -0.55, 0], 0.02);
}

function zonePads(root: THREE.Group, m: Materials) {
  for (const [x, z, w, d] of [
    [-16, -3, 17, 9],
    [16, -3, 17, 9],
    [-17, -13, 16, 7],
    [16, -13, 16, 7],
    [-17, 11, 16, 8],
    [16, 11, 16, 8],
  ] as const) {
    box(root, m.panel, [w, 0.05, d], [x, 0.05, z], 0.4);
    box(root, m.accentSoft, [w - 0.5, 0.012, 0.05], [x, 0.085, z + d / 2 - 0.3]);
    box(root, m.accentSoft, [w - 0.5, 0.012, 0.05], [x, 0.085, z - d / 2 + 0.3]);
  }
}

function rearFacade(root: THREE.Group, m: Materials) {
  box(root, m.graphite, [53, 0.3, 0.6], [0, 5.6, -18.3]);
  box(root, m.graphite, [53, 0.4, 0.8], [0, 0.2, -18.3]);
  for (let x = -24; x <= 24; x += 6) {
    box(root, m.graphite, [0.28, 5.4, 0.5], [x, 2.9, -18.25]);
    box(root, m.accent, [0.06, 5.0, 0.52], [x + 0.15, 2.9, -18.25], 0.01);
    if (x < 24) box(root, m.glass, [5.6, 5.0, 0.08], [x + 3, 2.9, -18.3]);
  }
}

function sidePylons(root: THREE.Group, m: Materials) {
  for (const x of [-26.2, 26.2])
    for (const z of [-16, -8, 0, 8, 16]) {
      box(root, m.graphite, [0.6, 5.6, 0.6], [x, 2.8, z]);
      box(root, m.accent, [0.1, 4.2, 0.64], [x + (x < 0 ? 0.3 : -0.3), 2.9, z], 0.01);
    }
}

function ceilingRails(root: THREE.Group, m: Materials) {
  for (const z of [-12, 0, 12]) {
    box(root, m.graphite, [52, 0.16, 0.3], [0, 5.9, z]);
    box(root, m.cyan, [48, 0.04, 0.1], [0, 5.78, z], 0.01);
  }
  for (const x of [-24, -12, 12, 24]) box(root, m.graphite, [0.3, 0.16, 36], [x, 5.9, 0]);
}

function northRooms(root: THREE.Group, m: Materials) {
  for (const x of [-8.2, 8.2]) {
    for (const z of [-17.2, -10]) box(root, m.graphite, [0.14, 4.2, 0.14], [x, 2.1, z]);
    for (const y of [0.16, 4.2]) box(root, m.graphite, [0.14, 0.14, 7.4], [x, y, -13.6]);
    box(root, m.glass, [0.08, 4.0, 7.2], [x, 2.1, -13.6]);
    box(root, m.accentSoft, [0.05, 0.05, 7.2], [x, 4.2, -13.6]);
  }
}

function frame(root: THREE.Group, m: Materials) {
  rearFacade(root, m);
  sidePylons(root, m);
  ceilingRails(root, m);
  northRooms(root, m);
}

function shell(root: THREE.Group, m: Materials) {
  deck(root, m);
  zonePads(root, m);
  frame(root, m);
}

function core(root: THREE.Group, m: Materials, model: FloorModel) {
  cylinder(root, m.glass, 1.5, 1.5, 6.0, [0, 3, 0], 40, true);
  cylinder(root, m.holoCyan, 0.55, 0.55, 5.9, [0, 3, 0], 24);
  cylinder(root, m.cyan, 0.12, 0.12, 5.9, [0, 3, 0], 12);
  for (const y of [0.1, 6.0]) {
    const collar = new THREE.Mesh(
      new THREE.LatheGeometry(
        [
          [CORE_COLLAR, -0.08],
          [1.62, -0.08],
          [1.62, 0.08],
          [CORE_COLLAR, 0.08],
          [CORE_COLLAR, -0.08],
        ].map(([r, h]) => new THREE.Vector2(r, h)),
        40,
      ),
      m.graphite,
    );
    collar.position.y = y;
    root.add(collar);
  }
  ring(m.accent, 3.6, 0.1, 0.1, root);
  ring(m.cyan, 3.05, 0.03, 0.1, root);
  // Moving rings are children of the floor, not merged, so they can turn.
  const outer = ring(m.accent, 2.4, 0.05, 1.2, model.group);
  const middle = ring(m.cyan, 1.9, 0.04, 2.4, model.group);
  const inner = ring(m.accent, 1.5, 0.035, 3.6, model.group);
  outer.rotation.x = Math.PI / 2 + 0.25;
  inner.rotation.x = Math.PI / 2 - 0.25;
  model.spinners.push(
    { mesh: outer, axis: 'z', speed: 0.5 },
    { mesh: middle, axis: 'z', speed: -0.8 },
    { mesh: inner, axis: 'z', speed: 1.1 },
  );
}

function atmosphere(m: Materials, model: FloorModel, accent: string) {
  drones(m, model);
  scanSweep(m, model);
  dataColumn(model, accent);
}

function drones(m: Materials, model: FloorModel) {
  const drone = (rx: number, rz: number, y: number, speed: number, phase: number) => {
    const craft = new THREE.Group();
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 24), m.cyan);
    halo.rotation.x = Math.PI / 2;
    craft.add(halo);
    craft.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), m.accent));
    const trail = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 10, 1, true), m.holoStrong);
    trail.rotation.z = Math.PI / 2;
    trail.position.x = -0.55;
    craft.add(trail);
    model.group.add(craft);
    model.orbiters.push({ mesh: craft, rx, rz, y, speed, phase });
  };
  drone(21, 12, 3.4, 0.22, 0);
  drone(14, 8, 4.3, -0.31, 2.1);
  drone(24, 15, 2.6, 0.16, 4.2);
}

function scanSweep(m: Materials, model: FloorModel) {
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(51, 1.2), m.holoStrong);
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.set(0, 0.12, -17);
  model.group.add(sweep);
  model.sweepers.push({ mesh: sweep, from: -17, to: 17, speed: 5.5 });
}

function dataColumn(model: FloorModel, accent: string) {
  const count = 90;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const a = i * 2.399;
    const r = 0.25 + (i % 7) * 0.12;
    positions.set([Math.cos(a) * r, (i / count) * 6, Math.sin(a) * r], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: accent,
      size: 0.1,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  model.group.add(points);
  model.streams.push({ points, speed: 1.4, height: 6 });
}

export function buildFloor(layout: Layout, floorIndex: number): FloorModel {
  const department = DEPARTMENTS.find((d) => d.floor === floorIndex) ?? itemAt(DEPARTMENTS, 0);
  const m = createMaterials(department.accent);
  const model = emptyFloorModel();
  const root = new THREE.Group();
  shell(root, m);
  core(root, m, model);
  THEMES[department.id](root, m, model);
  atmosphere(m, model, department.accent);
  for (const object of layout.objects) {
    if ((object.floor ?? 0) !== floorIndex || object.type === 'squad') continue;
    const group = new THREE.Group();
    furniture(group, object.type, m);
    group.position.set(object.x, 0, object.z);
    group.rotation.y = (object.rotation * Math.PI) / 2;
    root.add(group);
  }
  const merged = mergeStatic(root);
  model.group.add(merged);
  model.pulsers.push({ material: m.accent, base: 1.3, amplitude: 0.45, speed: 1.6 });
  model.holograms.push(m.hologram, m.hologramCyan);
  return model;
}

export function disposeFloor(model: FloorModel): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  model.group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material])
      materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}
