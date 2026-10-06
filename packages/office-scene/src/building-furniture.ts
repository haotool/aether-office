import * as THREE from 'three';
import type { Layout } from '@aether/contracts';
import { box } from './geometry.js';
import RAW_SEATING from './desk-seating.json';
import { type Materials } from './building-materials.js';
import { cylinder } from './building-parts.js';

// ── Furniture ────────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * A workstation without a monitor: a floating slab, an emitter bar and three holographic panes in an arc, and a hover
 * seat. Every height and size of the slab and the seat comes from desk-seating.json, which the animal audit checks the
 * characters against (tools/blender/audit_animals.py): change them there, not here.
 */
type V3 = [number, number, number];
/** desk-seating.json, with its sizes and positions typed as the points they are. */
const SEATING = RAW_SEATING as unknown as Record<
  'slab' | 'bar' | 'pedestal' | 'seat' | 'cushion' | 'back',
  { size: V3; at: V3; radius: number; height: number }
> & { sitter: { z: number }; screenY: number };

function desk(group: THREE.Group, m: Materials) {
  const { slab, bar, pedestal, seat, cushion, back } = SEATING;
  const top = slab.at[1] + slab.size[1] / 2; // the desk's working surface
  const glass = top + 0.065; // what stands on it: the emitter bar, the panes
  // Floating slab on one pedestal, lit from underneath.
  box(group, m.shell, slab.size, slab.at, 0.12);
  box(group, m.accent, [1.6, 0.012, 0.04], [0, top - 0.08, 0.4], 0);
  box(group, m.accentSoft, [1.5, 0.01, 0.7], [0, top - 0.077, 0], 0.05);
  cylinder(group, m.graphite, 0.09, pedestal.radius, pedestal.height, pedestal.at, 16);
  cylinder(group, m.graphite, 0.34, 0.34, 0.04, [0, 0.02, -0.05], 24);
  cylinder(group, m.accent, 0.36, 0.36, 0.012, [0, 0.045, -0.05], 32, true);
  // Emitter bar and the three panes it projects.
  box(group, m.graphite, bar.size, bar.at, 0.02);
  box(group, m.accent, [1.3, 0.012, 0.085], [0, bar.at[1] + 0.028, bar.at[2]], 0);
  // The centre pane is the member's own screen, drawn per member by the scene (see Member); the side panes belong to the desk.
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
  // Light keyboard projected on the slab.
  const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.16), m.hologramCyan);
  keys.rotation.x = -Math.PI / 2;
  keys.position.set(0, top + 0.007, 0.24);
  group.add(keys);
  // Hover seat: a shell over a ring of light, no legs.
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

export function furniture(
  group: THREE.Group,
  type: Layout['objects'][number]['type'],
  m: Materials,
) {
  if (type === 'desk') return desk(group, m);
  if (type === 'rack') {
    // Data pillar: a glass column with lit storage blocks, instead of a cabinet.
    cylinder(group, m.graphite, 0.62, 0.62, 0.16, [0, 0.08, 0], 6);
    cylinder(group, m.graphite, 0.62, 0.62, 0.16, [0, 2.5, 0], 6);
    cylinder(group, m.glass, 0.56, 0.56, 2.3, [0, 1.3, 0], 6, true);
    for (let y = 0.35; y < 2.3; y += 0.3)
      cylinder(group, y % 0.6 < 0.3 ? m.accent : m.cyan, 0.3, 0.3, 0.12, [0, y, 0], 6);
    cylinder(group, m.hologramCyan, 0.42, 0.42, 2.25, [0, 1.3, 0], 6, true);
  } else if (type === 'sofa') {
    box(group, m.graphite, [3.1, 0.25, 1.12], [0, 0.25, 0], 0.15);
    box(group, m.fabric, [3.0, 0.3, 1.05], [0, 0.52, 0], 0.18);
    box(group, m.fabric, [3.1, 0.7, 0.25], [0, 0.78, -0.48], 0.12);
    box(group, m.accentSoft, [3.0, 0.02, 0.02], [0, 0.12, 0.56], 0);
    for (const x of [-1.44, 1.44]) box(group, m.fabric, [0.25, 0.45, 1.1], [x, 0.68, 0], 0.12);
  } else if (type === 'plant') {
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
  } else {
    // Holo table: a ring of light with a projected volume above it.
    cylinder(group, m.shell, 1.25, 1.25, 0.1, [0, 0.76, 0], 48);
    cylinder(group, m.graphite, 0.35, 0.5, 0.72, [0, 0.36, 0], 20);
    cylinder(group, m.accent, 1.27, 1.27, 0.02, [0, 0.7, 0], 48, true);
    cylinder(group, m.hologram, 0.9, 0.9, 0.9, [0, 1.3, 0], 32, true);
  }
}
