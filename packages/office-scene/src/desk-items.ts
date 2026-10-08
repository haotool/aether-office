import {
  BoxGeometry,
  BufferAttribute,
  Color,
  CylinderGeometry,
  IcosahedronGeometry,
  MeshStandardMaterial,
  SphereGeometry,
  TorusGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { SLAB_TOP } from './seating.js';
import type { DeskItem } from './desk-profile.js';
import { itemAt } from './checked.js';

/**
 * The small things on a desk, each a few low-poly parts in one colour per part. A desk's items are merged into one
 * geometry (one draw call) and share one material; the geometry is shared by every desk with the same things.
 */
const TOP = SLAB_TOP;
/** Corners of the desk's top where things sit, clear of the keyboard, the emitter bar and the character's arms. */
const SLOTS = [
  { x: 0.66, z: 0.12 },
  { x: -0.66, z: 0.14 },
  { x: 0.52, z: -0.12 },
] as const;
const MUG_COLORS = ['#e8e4dc', '#e0605a', '#4aa3df', '#f2c14e'];

type Part = { geometry: BufferGeometry; color: string; at: [number, number, number]; yaw?: number };

const mug = (tint: number): Part[] => [
  {
    geometry: new CylinderGeometry(0.036, 0.032, 0.09, 10),
    color: itemAt(MUG_COLORS, tint % 4),
    at: [0, 0.045, 0],
  },
  {
    geometry: new TorusGeometry(0.024, 0.007, 5, 8),
    color: itemAt(MUG_COLORS, tint % 4),
    at: [0.04, 0.045, 0],
  },
  { geometry: new CylinderGeometry(0.03, 0.03, 0.004, 10), color: '#4a2f22', at: [0, 0.084, 0] },
];

const plant = (): Part[] => [
  { geometry: new CylinderGeometry(0.05, 0.04, 0.07, 8), color: '#c4684a', at: [0, 0.035, 0] },
  { geometry: new IcosahedronGeometry(0.06, 0), color: '#3f9d5b', at: [0, 0.12, 0] },
  { geometry: new IcosahedronGeometry(0.04, 0), color: '#58b873', at: [0.04, 0.17, 0.01] },
  { geometry: new IcosahedronGeometry(0.035, 0), color: '#2f7f49', at: [-0.04, 0.15, -0.02] },
];

const figure = (): Part[] => [
  { geometry: new CylinderGeometry(0.03, 0.035, 0.07, 8), color: '#5b7fd6', at: [0, 0.035, 0] },
  { geometry: new SphereGeometry(0.03, 8, 6), color: '#f1c8a0', at: [0, 0.1, 0] },
  { geometry: new CylinderGeometry(0.034, 0.034, 0.012, 8), color: '#2b2f3a', at: [0, 0.006, 0] },
];

const headphones = (): Part[] => [
  { geometry: new TorusGeometry(0.06, 0.008, 5, 12, Math.PI), color: '#2b2f3a', at: [0, 0.06, 0] },
  { geometry: new CylinderGeometry(0.03, 0.03, 0.025, 10), color: '#d8dde6', at: [-0.06, 0.03, 0] },
  { geometry: new CylinderGeometry(0.03, 0.03, 0.025, 10), color: '#d8dde6', at: [0.06, 0.03, 0] },
];

const notepad = (): Part[] => [
  {
    geometry: new BoxGeometry(0.16, 0.012, 0.21),
    color: '#f4f1e6',
    at: [0, 0.006, 0],
    yaw: 0.35,
  },
  {
    geometry: new BoxGeometry(0.16, 0.004, 0.02),
    color: '#d65a5a',
    at: [0, 0.013, -0.09],
    yaw: 0.35,
  },
  {
    geometry: new BoxGeometry(0.012, 0.012, 0.15),
    color: '#f2c14e',
    at: [0.1, 0.012, 0.02],
    yaw: 0.2,
  },
];

const sticky = (): Part[] =>
  ['#ffe66d', '#ff9fb2', '#9be0a3', '#8fd3ff'].map((color, i) => ({
    geometry: new BoxGeometry(0.07, 0.003, 0.07),
    color,
    at: [(i % 2) * 0.05 - 0.02, 0.002 + i * 0.003, Math.floor(i / 2) * 0.06] as [
      number,
      number,
      number,
    ],
    yaw: 0.3 * (i - 1.5),
  }));

const PARTS: Record<DeskItem, (tint: number) => Part[]> = {
  mug,
  plant,
  figure,
  headphones,
  notepad,
  sticky,
};

const ORDER: readonly DeskItem[] = ['mug', 'plant', 'figure', 'headphones', 'notepad', 'sticky'];
const cache = new Map<string, BufferGeometry>();

/** One merged geometry for these items (in a fixed order, so the same set is the same geometry). `tint` picks the mug's colour. */
export function deskItemsGeometry(items: readonly DeskItem[], tint: number): BufferGeometry | null {
  const sorted = ORDER.filter((i) => items.includes(i));
  if (!sorted.length) return null;
  const key = `${sorted.join(',')}:${sorted.includes('mug') ? tint % 4 : 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const merged = mergeGeometries(
    sorted.flatMap((item, slot) =>
      PARTS[item](tint).map(({ geometry, color, at, yaw = 0 }) => {
        const part = geometry.index ? geometry.toNonIndexed() : geometry;
        part.rotateY(yaw);
        const slotAt = itemAt(SLOTS, slot);
        part.translate(slotAt.x + at[0], TOP + at[1], slotAt.z + at[2]);
        const rgb = new Color(color);
        const channels = [rgb.r, rgb.g, rgb.b];
        part.setAttribute(
          'color',
          new BufferAttribute(
            Float32Array.from({ length: part.getAttribute('position').count * 3 }, (_, i) =>
              itemAt(channels, i % 3),
            ),
            3,
          ),
        );
        for (const name of Object.keys(part.attributes))
          if (!['position', 'normal', 'color'].includes(name)) part.deleteAttribute(name);
        return part;
      }),
    ),
  );
  cache.set(key, merged);
  return merged;
}

let material: MeshStandardMaterial | null = null;
/** The one material every desk's things share. */
export const deskItemsMaterial = (): MeshStandardMaterial =>
  (material ??= new MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 }));
