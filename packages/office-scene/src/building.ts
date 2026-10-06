import RAW_SEATING from './desk-seating.json';
import * as THREE from 'three';
import type { Layout } from '@aether/contracts';
import { DEPARTMENTS, type DepartmentId } from '@aether/kernel';
import { box, mergeStatic } from './geometry.js';

/** Floor-to-floor distance of the stacked building, and the extra gap the exploded view adds. */
export const FLOOR_HEIGHT = 7;
export const EXPLODED_GAP = 11;
/** The slabs are open this far from the axis, and the core's caps are rings from here out: the Git spire rises through. */
const WELL = 1.7;
const CORE_COLLAR = 1.35;

type Materials = ReturnType<typeof createMaterials>;

const glow = (color: string, intensity: number, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: intensity,
    roughness: 0.4,
    metalness: 0.2,
    ...extra,
  });

/** A holographic surface: additive, see-through, never writes depth, so overlapping layers shine rather than occlude. */
const holo = (color: string, opacity: number) =>
  new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

/**
 * A hologram: additive light that is brighter at grazing angles (fresnel), crossed by moving scanlines and a slow flicker.
 * One instance per floor; its `time` uniform is advanced by the scene.
 */
export function hologram(color: string, strength = 1) {
  return new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
      color: { value: new THREE.Color(color) },
      strength: { value: strength },
    },
    vertexShader: `
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        vView = normalize(cameraPosition - world.xyz);
        gl_Position = projectionMatrix * viewMatrix * world;
      }`,
    fragmentShader: `
      uniform float time;
      uniform vec3 color;
      uniform float strength;
      varying vec3 vWorld;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vView)), 1.6);
        float scan = 0.55 + 0.45 * sin(vWorld.y * 90.0 - time * 3.0);
        float band = smoothstep(0.92, 1.0, sin(vWorld.y * 3.0 - time * 1.4));
        float flicker = 0.92 + 0.08 * sin(time * 17.0 + vWorld.x * 3.0);
        float alpha = (0.18 + 0.55 * fresnel) * scan * flicker + band * 0.25;
        gl_FragColor = vec4(color * (0.7 + fresnel), alpha * strength);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
}

function createMaterials(accent: string) {
  return {
    hull: new THREE.MeshStandardMaterial({ color: '#070f16', metalness: 0.85, roughness: 0.3 }),
    slab: new THREE.MeshStandardMaterial({ color: '#0d1c27', metalness: 0.7, roughness: 0.32 }),
    deck: new THREE.MeshStandardMaterial({ color: '#1b4656', metalness: 0.45, roughness: 0.3 }),
    panel: new THREE.MeshStandardMaterial({ color: '#27576a', metalness: 0.4, roughness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: '#dfe9ec', roughness: 0.4, metalness: 0.25 }),
    graphite: new THREE.MeshStandardMaterial({ color: '#16242d', roughness: 0.42, metalness: 0.6 }),
    steel: new THREE.MeshStandardMaterial({ color: '#7e929c', roughness: 0.3, metalness: 0.9 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8d6f55', roughness: 0.7 }),
    fabric: new THREE.MeshStandardMaterial({ color: '#2f5a63', roughness: 0.95 }),
    green: new THREE.MeshStandardMaterial({ color: '#2f7a58', roughness: 0.85 }),
    darkgreen: new THREE.MeshStandardMaterial({ color: '#1d4a3e', roughness: 0.9 }),
    accent: glow(accent, 1.3),
    accentSoft: glow(accent, 0.55),
    cyan: glow('#5ee7e7', 1.1),
    amber: glow('#ffb454', 1.0),
    red: glow('#ff6b6b', 0.9),
    screen: glow('#0d3a48', 0.9, { color: '#0a2630' }),
    screenBright: glow(accent, 0.8, { color: '#10333f' }),
    glass: new THREE.MeshStandardMaterial({
      color: '#8fd3dc',
      transparent: true,
      opacity: 0.14,
      roughness: 0.15,
      metalness: 0.3,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    holo: holo(accent, 0.2),
    holoStrong: holo(accent, 0.42),
    holoCyan: holo('#5ee7e7', 0.22),
    hologram: hologram(accent),
    hologramCyan: hologram('#5ee7e7', 0.8),
    shell: new THREE.MeshStandardMaterial({ color: '#e7eef2', roughness: 0.25, metalness: 0.35 }),
  };
}

type Spinner = { mesh: THREE.Object3D; axis: 'x' | 'y' | 'z'; speed: number };
/** What a floor builds: merged static geometry (cheap to draw) and the few moving parts kept apart so they can animate. */
export type FloorModel = {
  group: THREE.Group;
  spinners: Spinner[];
  pulsers: { material: THREE.Material; base: number; amplitude: number; speed: number }[];
  /** Small lit craft gliding along an ellipse above the floor. */
  orbiters: {
    mesh: THREE.Object3D;
    rx: number;
    rz: number;
    y: number;
    speed: number;
    phase: number;
  }[];
  /** A light plane that sweeps the floor from front to back and starts over. */
  sweepers: { mesh: THREE.Object3D; from: number; to: number; speed: number }[];
  /** Rising points of light (the data column in the elevator core): positions are advanced every frame. */
  streams: { points: THREE.Points; speed: number; height: number }[];
  /** Hologram materials whose `time` uniform the scene advances. */
  holograms: THREE.ShaderMaterial[];
};

function ring(
  m: THREE.Material,
  radius: number,
  tube: number,
  y: number,
  parent: THREE.Object3D,
  x = 0,
  z = 0,
) {
  const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 96), m);
  mesh.rotation.x = Math.PI / 2;
  mesh.position.set(x, y, z);
  parent.add(mesh);
  return mesh;
}

function cylinder(
  parent: THREE.Object3D,
  m: THREE.Material,
  radiusTop: number,
  radiusBottom: number,
  height: number,
  position: [number, number, number],
  segments = 32,
  open = false,
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments, 1, open),
    m,
  );
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

/** Hull, deck, light channels, facade and ceiling rails shared by every floor, tinted with the department's colour. */
function shell(root: THREE.Group, m: Materials, floor: number) {
  // The slabs are open round the elevator core, so the Git spire can rise through the whole building.
  box(root, m.hull, [54.4, 0.9, 38.4], [0, -0.75, 0], 0.5, WELL);
  box(root, m.slab, [53, 0.3, 37], [0, -0.2, 0], 0.3, WELL);
  box(root, m.deck, [52, 0.14, 36], [0, -0.04, 0], 0.2, WELL);
  // Panel joints as thin light lines: the deck reads as a lit grid rather than a flat tile.
  for (let x = -24; x <= 24; x += 4) box(root, m.accentSoft, [0.035, 0.012, 35.6], [x, 0.04, 0], 0);
  for (let z = -16; z <= 16; z += 4) box(root, m.accentSoft, [51.6, 0.012, 0.035], [0, 0.04, z], 0);
  // The two circulation spines, kept clear of furniture by the layout rules.
  for (const x of [-1.15, 1.15]) box(root, m.cyan, [0.07, 0.025, 33], [x, 0.06, 0]);
  for (const z of [-1, 1]) box(root, m.cyan, [50, 0.025, 0.07], [0, 0.06, z]);
  // Perimeter light blade and edge glow.
  for (const z of [-18.4, 18.4]) box(root, m.accent, [52.6, 0.1, 0.12], [0, -0.55, z], 0.02);
  for (const x of [-26.4, 26.4]) box(root, m.accent, [0.12, 0.1, 37], [x, -0.55, 0], 0.02);
  // Zone pads: lit rectangles under the working areas.
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
  // Rear facade: framed glass with accent-lit mullions.
  box(root, m.graphite, [53, 0.3, 0.6], [0, 5.6, -18.3]);
  box(root, m.graphite, [53, 0.4, 0.8], [0, 0.2, -18.3]);
  for (let x = -24; x <= 24; x += 6) {
    box(root, m.graphite, [0.28, 5.4, 0.5], [x, 2.9, -18.25]);
    box(root, m.accent, [0.06, 5.0, 0.52], [x + 0.15, 2.9, -18.25], 0.01);
    if (x < 24) box(root, m.glass, [5.6, 5.0, 0.08], [x + 3, 2.9, -18.3]);
  }
  // Side pylons with light columns; the front and ceiling stay open so the floor reads from above.
  for (const x of [-26.2, 26.2])
    for (const z of [-16, -8, 0, 8, 16]) {
      box(root, m.graphite, [0.6, 5.6, 0.6], [x, 2.8, z]);
      box(root, m.accent, [0.1, 4.2, 0.64], [x + (x < 0 ? 0.3 : -0.3), 2.9, z], 0.01);
    }
  // Ceiling rails with light strips, so each floor has a defined top without hiding the one below.
  for (const z of [-12, 0, 12]) {
    box(root, m.graphite, [52, 0.16, 0.3], [0, 5.9, z]);
    box(root, m.cyan, [48, 0.04, 0.1], [0, 5.78, z], 0.01);
  }
  for (const x of [-24, -12, 12, 24]) box(root, m.graphite, [0.3, 0.16, 36], [x, 5.9, 0]);
  // North rooms: glass-walled with open doorways.
  for (const x of [-8.2, 8.2]) {
    for (const z of [-17.2, -10]) box(root, m.graphite, [0.14, 4.2, 0.14], [x, 2.1, z]);
    for (const y of [0.16, 4.2]) box(root, m.graphite, [0.14, 0.14, 7.4], [x, y, -13.6]);
    box(root, m.glass, [0.08, 4.0, 7.2], [x, 2.1, -13.6]);
    box(root, m.accentSoft, [0.05, 0.05, 7.2], [x, 4.2, -13.6]);
  }
  void floor;
}

/** The elevator core every floor shares: a glowing tube the building is organised around. */
function core(root: THREE.Group, m: Materials, model: FloorModel) {
  // The elevator core: a glass tube around a lit column, capped top and bottom.
  cylinder(root, m.glass, 1.5, 1.5, 6.0, [0, 3, 0], 40, true);
  cylinder(root, m.holoCyan, 0.55, 0.55, 5.9, [0, 3, 0], 24);
  cylinder(root, m.cyan, 0.12, 0.12, 5.9, [0, 3, 0], 12);
  // Open collars, not caps: the spire passes through the core.
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
  const rings = [
    ring(m.accent, 2.4, 0.05, 1.2, model.group),
    ring(m.cyan, 1.9, 0.04, 2.4, model.group),
    ring(m.accent, 1.5, 0.035, 3.6, model.group),
  ];
  rings[0]!.rotation.x = Math.PI / 2 + 0.25;
  rings[2]!.rotation.x = Math.PI / 2 - 0.25;
  model.spinners.push(
    { mesh: rings[0]!, axis: 'z', speed: 0.5 },
    { mesh: rings[1]!, axis: 'z', speed: -0.8 },
    { mesh: rings[2]!, axis: 'z', speed: 1.1 },
  );
}

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

const THEMES: Record<DepartmentId, (root: THREE.Group, m: Materials, model: FloorModel) => void> = {
  product: productTheme,
  platform: platformTheme,
  quality: qualityTheme,
  data: dataTheme,
  leadership: leadershipTheme,
};

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

function furniture(group: THREE.Group, type: Layout['objects'][number]['type'], m: Materials) {
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

/** Everything that makes a floor feel inhabited from a distance: light shafts, drones, a scanning sweep, data streaming up the core. */
function atmosphere(root: THREE.Group, m: Materials, model: FloorModel, accent: string) {
  // Light shafts above the six zone pads: faint additive cones, brightest at the floor.
  for (const [x, z] of [
    [-16, -3],
    [16, -3],
    [-17, 11],
    [16, 11],
    [-17, -13],
    [16, -13],
  ] as const) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 5, 24, 1, true), m.holo);
    cone.position.set(x, 2.55, z);
    cone.rotation.x = Math.PI;
    root.add(cone);
  }
  // Drones: a ring of light under a lit core, three per floor on different paths.
  const drone = (rx: number, rz: number, y: number, speed: number, phase: number) => {
    const craft = new THREE.Group();
    craft.add(new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 6, 24), m.cyan));
    craft.children[0]!.rotation.x = Math.PI / 2;
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
  // Scan sweep: a thin lit plane crossing the floor, so the deck visibly "scans" every few seconds.
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(51, 1.2), m.holoStrong);
  sweep.rotation.x = -Math.PI / 2;
  sweep.position.set(0, 0.12, -17);
  model.group.add(sweep);
  model.sweepers.push({ mesh: sweep, from: -17, to: 17, speed: 5.5 });
  // Data column: points of light climbing the elevator core.
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

/** One floor of the building, ready to be placed at its height. Local y = 0 is the deck. */
export function buildFloor(layout: Layout, floorIndex: number): FloorModel {
  const department = DEPARTMENTS.find((d) => d.floor === floorIndex) ?? DEPARTMENTS[0]!;
  const m = createMaterials(department.accent);
  const model: FloorModel = {
    group: new THREE.Group(),
    spinners: [],
    pulsers: [],
    orbiters: [],
    sweepers: [],
    streams: [],
    holograms: [],
  };
  const root = new THREE.Group();
  shell(root, m, floorIndex);
  core(root, m, model);
  THEMES[department.id](root, m, model);
  atmosphere(root, m, model, department.accent);
  for (const object of layout.objects) {
    if ((object.floor ?? 0) !== floorIndex) continue;
    const group = new THREE.Group();
    furniture(group, object.type, m);
    group.position.set(object.x, 0, object.z);
    group.rotation.y = (object.rotation * Math.PI) / 2;
    root.add(group);
  }
  const merged = mergeStatic(root);
  model.group.add(merged);
  // Pulsing accent: one material shared by the trim, breathing slowly.
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
