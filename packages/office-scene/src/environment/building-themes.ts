import * as THREE from 'three';
import { type DepartmentId } from '@aether/kernel';
import { box } from './geometry.js';
import { type Materials } from './building-materials.js';
import { type FloorModel, ring, cylinder } from './building-parts.js';

// ── Department themes ────────────────────────────────────────────────────────────────────────────────────────────

function productTheme(root: THREE.Group, m: Materials, model: FloorModel) {
  // Design wall: floating prototype screens along the rear facade.
  for (const [x, w] of [
    [-18, 6],
    [-10.5, 4.5],
    [10.5, 4.5],
    [18, 6],
  ] as const) {
    box(root, m.graphite, [w, 2.6, 0.18], [x, 3.0, -17.4], 0.05);
    box(root, m.screenBright, [w - 0.3, 2.3, 0.04], [x, 3.0, -17.28], 0.02);
    for (let i = 0; i < 4; i++)
      box(root, m.accent, [w * 0.18, 0.06, 0.05], [x - w * 0.3 + i * (w * 0.2), 2.2, -17.25], 0.01);
  }
  // Product sync table with a projected prototype.
  box(root, m.white, [6, 0.12, 2.6], [0, 0.82, -13.4], 0.3);
  box(root, m.graphite, [0.5, 0.8, 0.5], [0, 0.4, -13.4], 0.1);
  const cube = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9), m.holoStrong);
  cube.position.set(0, 1.9, -13.4);
  model.group.add(cube);
  model.spinners.push({ mesh: cube, axis: 'y', speed: 0.9 });
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.2), m.holoCyan);
  frame.position.set(0, 1.9, -13.4);
  model.group.add(frame);
  model.spinners.push({ mesh: frame, axis: 'y', speed: -0.5 });
}

function platformTheme(root: THREE.Group, m: Materials, model: FloorModel) {
  // NOC wall: a 3x2 array of live-looking panels.
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < 2; r++) {
      const x = -22 + c * 3.7,
        y = 2.2 + r * 1.9;
      box(root, m.graphite, [3.5, 1.7, 0.16], [x, y, -17.4], 0.04);
      box(root, m.screenBright, [3.3, 1.5, 0.04], [x, y, -17.28], 0.01);
      for (let i = 0; i < 6; i++)
        box(
          root,
          m.cyan,
          [0.2, 0.15 + ((i * 3 + c + r) % 5) * 0.16, 0.05],
          [x - 1.2 + i * 0.48, y - 0.5 + (0.15 + ((i * 3 + c + r) % 5) * 0.16) / 2, -17.25],
          0.01,
        );
    }
  // Status tower lights and a cooling loop along the ceiling.
  for (const x of [8, 11, 14]) {
    box(root, m.graphite, [0.5, 3.4, 0.5], [x, 1.7, -16.4], 0.1);
    box(root, m.cyan, [0.52, 0.3, 0.52], [x, 2.6, -16.4], 0.04);
    box(root, m.amber, [0.52, 0.3, 0.52], [x, 2.1, -16.4], 0.04);
    box(root, m.accent, [0.52, 0.3, 0.52], [x, 3.1, -16.4], 0.04);
  }
  for (let x = -24; x <= 24; x += 8)
    cylinder(root, m.steel, 0.14, 0.14, 8, [x, 5.35, -16.2], 12).rotation.z = Math.PI / 2;
  // Command console in the incident room.
  box(root, m.graphite, [5.5, 0.9, 1.2], [0, 0.45, -13.5], 0.15);
  box(root, m.screenBright, [5.2, 0.04, 0.9], [0, 0.93, -13.5], 0.01);
  const dish = ring(m.holoStrong, 1.3, 0.025, 1.6, model.group, 0, -13.5);
  model.spinners.push({ mesh: dish, axis: 'z', speed: 1.4 });
}

function qualityTheme(root: THREE.Group, m: Materials, model: FloorModel) {
  // Scan gate: a portal arch every deliverable walks through.
  for (const x of [-1.6, 1.6]) box(root, m.graphite, [0.3, 3.6, 0.5], [x, 1.8, 8.2], 0.08);
  box(root, m.graphite, [3.5, 0.3, 0.5], [0, 3.6, 8.2], 0.08);
  box(root, m.accent, [2.9, 0.06, 0.06], [0, 3.4, 8.2], 0.01);
  box(root, m.holoStrong, [2.9, 3.2, 0.02], [0, 1.8, 8.2], 0);
  // Test lab: benches with specimen holograms.
  for (const x of [-20, -15, -10]) {
    box(root, m.white, [3.4, 0.12, 1.4], [x, 0.85, -14], 0.1);
    box(root, m.graphite, [3.2, 0.8, 1.2], [x, 0.4, -14], 0.08);
    const specimen = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), m.holoCyan);
    specimen.position.set(x, 1.7, -14);
    model.group.add(specimen);
    model.spinners.push({ mesh: specimen, axis: 'y', speed: 0.7 + (x + 20) * 0.03 });
  }
  // Sandbox chamber: a glass cell holding a pulsing core.
  box(root, m.glass, [3.4, 3.0, 3.4], [16, 1.5, -13.6], 0.05);
  box(root, m.graphite, [3.5, 0.2, 3.5], [16, 0.1, -13.6], 0.05);
  box(root, m.red, [0.6, 0.6, 0.6], [16, 1.3, -13.6], 0.1);
  // Shield emblem above the security studio.
  const shield = ring(m.holoStrong, 1.4, 0.04, 3.9, model.group, 16, -3);
  shield.rotation.x = 0;
  model.spinners.push({ mesh: shield, axis: 'y', speed: 0.6 });
}

function dataTheme(root: THREE.Group, m: Materials, model: FloorModel) {
  // Data lake: tall translucent tanks with luminous stacks inside.
  for (const x of [-21, -17, -13]) {
    cylinder(root, m.glass, 1.4, 1.4, 4.6, [x, 2.4, -14], 36);
    cylinder(root, m.graphite, 1.5, 1.5, 0.2, [x, 0.1, -14], 36);
    cylinder(root, m.graphite, 1.5, 1.5, 0.2, [x, 4.7, -14], 36);
    for (let i = 0; i < 5; i++)
      cylinder(root, i % 2 ? m.cyan : m.accent, 1.0, 1.0, 0.12, [x, 0.8 + i * 0.75, -14], 28);
  }
  // Pipeline: tubes with moving packets along the floor of the lake room.
  for (const z of [-16, -12])
    cylinder(root, m.steel, 0.1, 0.1, 14, [-17, 0.35, z], 10).rotation.z = Math.PI / 2;
  // Analytics room: a wall of bars and a rotating dataset sphere.
  box(root, m.graphite, [7, 2.8, 0.16], [0, 3.1, -17.4], 0.05);
  box(root, m.screenBright, [6.7, 2.5, 0.04], [0, 3.1, -17.28], 0.01);
  for (let i = 0; i < 9; i++)
    box(
      root,
      m.accent,
      [0.4, 0.4 + ((i * 7) % 5) * 0.3, 0.05],
      [-3 + i * 0.75, 2.1 + (0.4 + ((i * 7) % 5) * 0.3) / 2, -17.25],
      0.01,
    );
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(0.95, 18, 12), holoWire(m));
  sphere.position.set(0, 1.9, -13.4);
  model.group.add(sphere);
  model.spinners.push({ mesh: sphere, axis: 'y', speed: 0.6 });
}

function holoWire(m: Materials) {
  const material = (m.holoStrong as THREE.MeshBasicMaterial).clone();
  material.wireframe = true;
  return material;
}

function leadershipTheme(root: THREE.Group, m: Materials, model: FloorModel) {
  // Strategy room: a round table projecting a map.
  cylinder(root, m.white, 2.6, 2.6, 0.14, [0, 0.82, -13.4], 56);
  cylinder(root, m.graphite, 0.5, 0.7, 0.8, [0, 0.4, -13.4], 20);
  cylinder(root, m.holoStrong, 2.0, 2.0, 0.02, [0, 0.95, -13.4], 56);
  const globe = new THREE.Mesh(new THREE.SphereGeometry(0.8, 20, 14), holoWire(m));
  globe.position.set(0, 1.9, -13.4);
  model.group.add(globe);
  model.spinners.push({ mesh: globe, axis: 'y', speed: 0.5 });
  // Library wall and studio stage.
  for (const x of [11, 15, 19, 23]) {
    box(root, m.graphite, [2.6, 4.2, 0.5], [x, 2.1, -16.8]);
    for (let h = 0.4; h < 4; h += 0.7)
      for (let j = 0; j < 7; j++)
        box(
          root,
          j % 3 === 0 ? m.accent : m.white,
          [0.18, 0.46, 0.38],
          [x - 0.95 + j * 0.3, h + 0.25, -16.55],
          0.01,
        );
  }
  box(root, m.graphite, [7, 0.3, 3], [-17, 0.15, 12], 0.1);
  box(root, m.graphite, [8, 3.2, 0.2], [-17, 2.0, 14], 0.05);
  box(root, m.screenBright, [7.6, 2.8, 0.04], [-17, 2.0, 13.88], 0.01);
}

export const THEMES: Record<
  DepartmentId,
  (root: THREE.Group, m: Materials, model: FloorModel) => void
> = {
  product: productTheme,
  platform: platformTheme,
  quality: qualityTheme,
  data: dataTheme,
  leadership: leadershipTheme,
};
