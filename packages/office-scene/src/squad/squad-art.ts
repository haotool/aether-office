import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  CapsuleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  Matrix4,
  MeshBasicMaterial,
  NormalBlending,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  Vector3,
  type BufferGeometry,
  type InstancedMesh,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SLAB_TOP } from '../core/seating.js';

export const DESK_TOP = SLAB_TOP;
export const SUPERVISOR_GOLD = '#ffc65c';
export const WAITING_AMBER = '#ffc65c';

const FLAT = -Math.PI / 2;
/** The parts of one piece, as one geometry (every part carries the same attributes, so merging cannot fail). */
export const merged = (parts: BufferGeometry[]): BufferGeometry => {
  const geometry = mergeGeometries(parts);
  if (!geometry) throw new Error('the parts of a squad piece must share their attributes');
  return geometry;
};
const paint = (g: BufferGeometry, hex: string): BufferGeometry => {
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) c.toArray(colors, i * 3);
  g.setAttribute('color', new BufferAttribute(colors, 3));
  return g.index ? g.toNonIndexed() : g;
};
const at = (g: BufferGeometry, x: number, y: number, z: number) => g.translate(x, y, z);

let cache: ReturnType<typeof build> | null = null;
function build() {
  const WHITE = '#ffffff';
  return {
    ring: paint(new RingGeometry(0.5, 0.57, 40).rotateX(FLAT), WHITE),
    stool: merged([
      paint(at(new CylinderGeometry(0.27, 0.22, 0.4, 14), 0, 0.2, 0), WHITE),
      paint(at(new CylinderGeometry(0.31, 0.31, 0.07, 14), 0, 0.44, 0), WHITE),
      paint(at(new BoxGeometry(0.03, 0.78, 0.03), 0, 0.39, -0.62), WHITE),
    ]),
    pane: paint(at(new PlaneGeometry(0.5, 0.32), 0, 0.92, -0.62), WHITE),
    silhouette: merged([
      paint(at(new CapsuleGeometry(0.2, 0.34, 3, 8), 0, 0.82, 0), WHITE),
      paint(at(new SphereGeometry(0.15, 10, 8), 0, 1.36, 0), WHITE),
    ]),
    filament: paint(new CylinderGeometry(0.018, 0.018, 1, 5, 1, true), WHITE),
    halo: paint(new RingGeometry(0.34, 0.4, 36).rotateX(FLAT), WHITE),
    dressing: merged([
      paint(at(new BoxGeometry(0.34, 0.035, 0.26), -0.55, DESK_TOP + 0.02, -0.18), '#d8c9a3'),
      paint(at(new BoxGeometry(0.34, 0.035, 0.26), -0.55, DESK_TOP + 0.06, -0.18), '#c9b88c'),
      paint(at(new BoxGeometry(1.7, 0.012, 0.03), 0, DESK_TOP + 0.006, 0.4), SUPERVISOR_GOLD),
    ]),
  };
}
export const art = () => (cache ??= build());

const material = (additive: boolean, opacity: number) =>
  new MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity,
    blending: additive ? AdditiveBlending : NormalBlending,
    depthWrite: !additive,
    toneMapped: false,
    side: DoubleSide,
    forceSinglePass: true, // one pass, one shader: a double-sided transparent mesh is otherwise drawn twice, by two programs
  });
let materials: { glow: MeshBasicMaterial; solid: MeshBasicMaterial } | null = null;
export const squadMaterials = () =>
  (materials ??= { glow: material(true, 0.55), solid: material(false, 1) });

export type Instance = {
  at: readonly [number, number, number];
  yaw?: number;
  quaternion?: Quaternion;
  scale?: readonly [number, number, number];
  color: Color | string;
};
const matrix = new Matrix4();
const quat = new Quaternion();
const UP = new Vector3(0, 1, 0);
const tint = new Color();
const position = new Vector3();
const scaling = new Vector3();
const ONE = [1, 1, 1] as const;
const palette = new Map<string, Color>();
const PALETTE_MAX = 64;
export const colorOf = (value: Color | string): Color => {
  if (typeof value !== 'string') return value;
  let known = palette.get(value);
  if (!known) {
    if (palette.size >= PALETTE_MAX) palette.clear();
    known = new Color(value);
    palette.set(value, known);
  }
  return known;
};

/**
 * Instance colours are given before the first draw, so the shader is built once (adding them later would build it
 * again).
 */
export function withColors(mesh: InstancedMesh | null): void {
  if (mesh && !mesh.instanceColor) mesh.setColorAt(0, tint.set('#ffffff'));
}

export function writeInstance(
  mesh: InstancedMesh,
  i: number,
  at: readonly [number, number, number],
  rotation: Quaternion,
  scale: readonly [number, number, number],
  color: Color | string | null,
): boolean {
  matrix.compose(
    position.set(at[0], at[1], at[2]),
    rotation,
    scaling.set(scale[0], scale[1], scale[2]),
  );
  const held = mesh.instanceMatrix.array;
  const elements = matrix.elements;
  let changed = false;
  for (let k = 0; k < 16 && !changed; k++)
    changed = held[i * 16 + k] !== Math.fround(elements[k] ?? 0);
  if (changed) mesh.setMatrixAt(i, matrix);
  if (color !== null) {
    const c = colorOf(color);
    const shown = mesh.instanceColor?.array;
    if (
      !shown ||
      shown[i * 3] !== Math.fround(c.r) ||
      shown[i * 3 + 1] !== Math.fround(c.g) ||
      shown[i * 3 + 2] !== Math.fround(c.b)
    ) {
      mesh.setColorAt(i, c);
      changed = true;
    }
  }
  return changed;
}

export function finishInstances(mesh: InstancedMesh, n: number, changed: boolean): void {
  const count = Math.min(n, mesh.instanceMatrix.count);
  const resized = mesh.count !== count;
  mesh.count = count;
  mesh.visible = count > 0;
  if (!changed && !resized) return;
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

export function writeInstances(
  mesh: InstancedMesh,
  items: readonly Instance[],
  colored = true,
): void {
  const n = Math.min(items.length, mesh.instanceMatrix.count);
  let changed = false;
  for (let i = 0; i < n; i++) {
    const item = items[i];
    if (!item) break;
    if (!item.quaternion) quat.setFromAxisAngle(UP, item.yaw ?? 0);
    const moved = writeInstance(
      mesh,
      i,
      item.at,
      item.quaternion ?? quat,
      item.scale ?? ONE,
      colored ? item.color : null,
    );
    changed = moved || changed;
  }
  finishInstances(mesh, n, changed);
}
