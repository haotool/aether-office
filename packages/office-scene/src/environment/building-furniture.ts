import * as THREE from 'three';
import type { Layout } from '@aether/contracts';
import { box } from './geometry.js';
import { SEATING } from '../core/seating.js';
import { type Materials } from './building-materials.js';
import { cylinder } from './building-parts.js';

function desk(group: THREE.Group, m: Materials) {
  const top = SEATING.slab.at[1] + SEATING.slab.size[1] / 2;
  deskSlab(group, m, top);
  deskPanes(group, m, top);
  hoverSeat(group, m);
}

function deskSlab(group: THREE.Group, m: Materials, top: number) {
  const { slab, bar, pedestal } = SEATING;
  box(group, m.shell, slab.size, slab.at, 0.12);
  box(group, m.accent, [1.6, 0.012, 0.04], [0, top - 0.08, 0.4], 0);
  box(group, m.accentSoft, [1.5, 0.01, 0.7], [0, top - 0.077, 0], 0.05);
  cylinder(group, m.graphite, 0.09, pedestal.radius, pedestal.height, pedestal.at, 16);
  cylinder(group, m.graphite, 0.34, 0.34, 0.04, [0, 0.02, -0.05], 24);
  cylinder(group, m.accent, 0.36, 0.36, 0.012, [0, 0.045, -0.05], 32, true);
  box(group, m.graphite, bar.size, bar.at, 0.02);
  box(group, m.accent, [1.3, 0.012, 0.085], [0, bar.at[1] + 0.028, bar.at[2]], 0);
}

function deskPanes(group: THREE.Group, m: Materials, top: number) {
  const glass = top + 0.065;
  for (const [x, angle, w] of [
    [-0.62, 0.42, 0.52],
    [0.62, -0.42, 0.52],
  ] as const) {
    const pane = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.42), m.hologram);
    pane.position.set(x, glass + 0.31, -0.3 + Math.abs(x) * 0.28);
    pane.rotation.y = angle;
    group.add(pane);
    box(
      group,
      m.accent,
      [w, 0.006, 0.006],
      [x, glass + 0.52, -0.3 + Math.abs(x) * 0.28],
      0,
    ).rotation.y = angle;
  }
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), m.hologramCyan);
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, top + 0.007, 0.24);
  group.add(keys);
}

function hoverSeat(group: THREE.Group, m: Materials) {
  const { seat, cushion, back } = SEATING;
  box(group, m.shell, seat.size, seat.at, 0.14);
  box(group, m.shell, back.size, back.at, 0.12);
  box(group, m.fabric, cushion.size, cushion.at, 0.1);
  box(
    group,
    m.accent,
    [0.36, 0.015, 0.015],
    [0, back.at[1] + back.size[1] / 2 - 0.02, back.at[2] + 0.05],
    0,
  );
  const lift = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.025, 8, 32), m.accent);
  lift.rotation.x = Math.PI / 2;
  lift.position.set(0, seat.at[1] - 0.15, 0.9);
  group.add(lift);
  const glowPad = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), m.holo);
  glowPad.rotation.x = -Math.PI / 2;
  glowPad.position.set(0, 0.03, 0.9);
  group.add(glowPad);
}

function rack(group: THREE.Group, m: Materials) {
  cylinder(group, m.graphite, 0.62, 0.62, 0.16, [0, 0.08, 0], 6);
  cylinder(group, m.graphite, 0.62, 0.62, 0.16, [0, 2.5, 0], 6);
  cylinder(group, m.glass, 0.56, 0.56, 2.3, [0, 1.3, 0], 6, true);
  for (let y = 0.35; y < 2.3; y += 0.3)
    cylinder(group, y % 0.6 < 0.3 ? m.accent : m.cyan, 0.3, 0.3, 0.12, [0, y, 0], 6);
  cylinder(group, m.hologramCyan, 0.42, 0.42, 2.25, [0, 1.3, 0], 6, true);
}

function sofa(group: THREE.Group, m: Materials) {
  box(group, m.graphite, [3.1, 0.25, 1.12], [0, 0.25, 0], 0.15);
  box(group, m.fabric, [3.0, 0.3, 1.05], [0, 0.52, 0], 0.18);
  box(group, m.fabric, [3.1, 0.7, 0.25], [0, 0.78, -0.48], 0.12);
  box(group, m.accentSoft, [3.0, 0.02, 0.02], [0, 0.12, 0.56], 0);
  for (const x of [-1.44, 1.44]) box(group, m.fabric, [0.25, 0.45, 1.1], [x, 0.68, 0], 0.12);
}

function plant(group: THREE.Group, m: Materials) {
  cylinder(group, m.white, 0.3, 0.22, 0.52, [0, 0.27, 0], 14);
  cylinder(group, m.wood, 0.025, 0.035, 0.8, [0, 0.88, 0], 7);
  for (let i = 0; i < 9; i++) {
    const a = i * 2.399;
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(0.25, 8, 6),
      i % 2 ? m.green : m.darkgreen,
    );
    leaf.scale.set(0.48, 1.45, 0.75);
    leaf.rotation.set(0.3, a, 0.7);
    leaf.position.set(Math.sin(a) * 0.19, 0.85 + i * 0.085, Math.cos(a) * 0.19);
    group.add(leaf);
  }
}

function holoTable(group: THREE.Group, m: Materials) {
  cylinder(group, m.shell, 1.25, 1.25, 0.1, [0, 0.76, 0], 48);
  cylinder(group, m.graphite, 0.35, 0.5, 0.72, [0, 0.36, 0], 20);
  cylinder(group, m.accent, 1.27, 1.27, 0.02, [0, 0.7, 0], 48, true);
  cylinder(group, m.hologram, 0.9, 0.9, 0.9, [0, 1.3, 0], 32, true);
}

export function furniture(
  group: THREE.Group,
  type: Layout['objects'][number]['type'],
  m: Materials,
) {
  if (type === 'desk') return desk(group, m);
  if (type === 'rack') return rack(group, m);
  if (type === 'sofa') return sofa(group, m);
  if (type === 'plant') return plant(group, m);
  return holoTable(group, m);
}
