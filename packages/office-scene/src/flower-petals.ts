import * as THREE from 'three';
import type { Bloom } from './flower-bloom.js';
import { KIND, MeshBuilder, type Style } from './flower-mesh.js';
import { itemAt } from './checked.js';

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
export const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** A part's `order` (how late in the bloom it appears), 0 to 1 within the flower's own share of the bloom. */
export const orderOf = (bloom: Bloom, x: number) =>
  (bloom.after ?? 0) + (1 - (bloom.after ?? 0)) * x;

type Petal = { phi: number; whorl: number; scale: number; lip: number; order: number };

/** A petal's grid of points in the flower's frame, with the directions and the foot it hinges on. */
type PetalSurface = {
  along: number[];
  at: (i: number, j: number) => THREE.Vector3;
  er: THREE.Vector3;
  ey: THREE.Vector3;
  et: THREE.Vector3;
  r0: number;
  h0: number;
  theta0: number;
};

/** The centerline of a petal, row by row: how far out and up each row is and which way it points. */
function centerline(
  along: readonly number[],
  {
    r0,
    h0,
    theta0,
    length,
    bend,
  }: { r0: number; h0: number; theta0: number; length: number; bend: number },
) {
  const rows = along.length;
  let r = r0;
  let y = h0;
  return along.map((u, i) => {
    if (i > 0) {
      const theta = theta0 + bend * (u - 0.5 / (rows - 1));
      r += (length / (rows - 1)) * Math.sin(theta);
      y += (length / (rows - 1)) * Math.cos(theta);
    }
    return { r, y, theta: theta0 + bend * u };
  });
}

/** One petal as a grid of points: the centerline bends by `curl`, the cross-section cups, the edge ruffles, the whole twists. */
function petalSurface(bloom: Bloom, p: Petal, [cols, rows]: [number, number]): PetalSurface {
  const { genome: g, size } = bloom;
  const s = g.shape;
  const length = size * s.length * p.scale * (1 - 0.18 * p.whorl);
  const wmax = length * s.width;
  const r0 = size * Math.max(0.05, s.disc * 0.8) + s.float * size * 0.22;
  const h0 = s.float * size * 0.28 * p.whorl + (bloom.grand ? size * 0.07 * p.whorl : 0);
  const theta0 = Math.max(0.03, s.pitch - s.pitchStep * p.whorl);
  const er = V3(Math.cos(p.phi), 0, Math.sin(p.phi));
  const ey = V3(0, 1, 0);
  const et = V3(-Math.sin(p.phi), 0, Math.cos(p.phi));
  const along = Array.from({ length: cols }, (_, i) => i / (cols - 1));
  const centers = centerline(along, { r0, h0, theta0, length, bend: s.curl + p.lip });
  const point = (i: number, j: number) => {
    const u = itemAt(along, i);
    const v = -1 + (2 * j) / (rows - 1);
    const { r, y, theta } = itemAt(centers, i);
    const profile = Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, s.taper))), s.belly);
    const w = v * wmax * profile;
    const n = er.clone().multiplyScalar(-Math.cos(theta)).addScaledVector(ey, Math.sin(theta));
    const alpha = s.twist * u;
    const side = et.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(n, Math.sin(alpha));
    const lift = n.clone().multiplyScalar(Math.cos(alpha)).addScaledVector(et, -Math.sin(alpha));
    const bend =
      s.cup * Math.abs(w) * 0.9 +
      s.ruffle * wmax * Math.sin(u * 9 + p.phi * 3) * v * v * smooth(0.15, 1, u);
    return er
      .clone()
      .multiplyScalar(r)
      .addScaledVector(ey, y)
      .addScaledVector(side, w)
      .addScaledVector(lift, bend);
  };
  const positions = along.flatMap((_, i) => Array.from({ length: rows }, (_, j) => point(i, j)));
  const at = (i: number, j: number) =>
    itemAt(
      positions,
      Math.min(cols - 1, Math.max(0, i)) * rows + Math.min(rows - 1, Math.max(0, j)),
    );
  return { along, at, er, ey, et, r0, h0, theta0 };
}

/** The hinge a petal swings about and how it sways, in the world. */
function petalStyle(
  bloom: Bloom,
  p: Petal,
  { er, ey, et, r0, h0, theta0 }: PetalSurface,
  frame: THREE.Matrix4,
  tint: [THREE.Color, THREE.Color],
): Style {
  const { genome: g, size } = bloom;
  return {
    hinge: er.clone().multiplyScalar(r0).addScaledVector(ey, h0).applyMatrix4(frame),
    axis: et.clone().transformDirection(frame),
    swing: Math.max(0, theta0 - 0.06),
    order: p.order,
    flower: bloom.flower,
    kind: KIND.petal,
    colorA: tint[0],
    colorB: tint[1],
    detail: g.shape.veins,
    glass: g.shape.glass,
    sway: size * 0.1,
  };
}

function petal(
  b: MeshBuilder,
  bloom: Bloom,
  frame: THREE.Matrix4,
  p: Petal,
  grid: [number, number],
  tint: [THREE.Color, THREE.Color],
) {
  const [cols, rows] = grid;
  const surface = petalSurface(bloom, p, grid);
  const { along, at } = surface;
  const style = petalStyle(bloom, p, surface, frame, tint);
  // The petal closes to a point at both ends, where the grid has no width and no normal: those rows borrow their neighbour's.
  const normalAt = (i: number, j: number) => {
    const row = Math.min(cols - 2, Math.max(1, i));
    const du = at(row + 1, j)
      .clone()
      .sub(at(row - 1, j));
    const dv = at(row, j + 1)
      .clone()
      .sub(at(row, j - 1));
    return new THREE.Vector3().crossVectors(dv, du).normalize().transformDirection(frame);
  };
  // Vertices are laid out row by row along the length, `rows` across.
  const first = b.position.length / 3;
  for (let i = 0; i < cols; i++)
    for (let j = 0; j < rows; j++)
      b.vertex(
        at(i, j).clone().applyMatrix4(frame),
        normalAt(i, j),
        itemAt(along, i),
        -1 + (2 * j) / (rows - 1),
        style,
      );
  for (let i = 0; i < cols - 1; i++)
    for (let j = 0; j < rows - 1; j++) {
      const a = first + i * rows + j;
      b.quad(a, a + 1, a + rows + 1, a + rows);
    }
}

/** The great bloom's whorls bend differently: the outer ones turn their tips back, the inner ones cup inwards. */
const grandCurl = (whorl: number, whorls: number) => 0.55 - 0.9 * (whorl / Math.max(1, whorls - 1));

/** Points across and along a petal: a bud's few, a faceted or thinned flower's fewer, the great bloom's most. */
function gridFor(bloom: Bloom, low: boolean, bud: boolean): [number, number] {
  if (bud) return [4, 2];
  if (bloom.grand) return low ? [6, 4] : [11, 6];
  return bloom.genome.shape.facet > 0.5 || low ? [4, 3] : [7, 4];
}

/** The petals: whorls of `petals` each, each whorl turned from the last (evenly, or by the golden angle), outer ones first. */
export function petals(
  b: MeshBuilder,
  bloom: Bloom,
  frame: THREE.Matrix4,
  low: boolean,
  bud: boolean,
) {
  const { genome: g } = bloom;
  const s = g.shape;
  const whorls = bud ? 1 : g.whorls;
  // The great bloom thins its whorls towards the centre and draws each petal finer.
  const countOf = (j: number) =>
    bud ? 5 : bloom.grand ? Math.max(5, Math.round(g.petals * (1 - 0.17 * j))) : g.petals;
  const grid = gridFor(bloom, low, bud);
  for (let j = 0; j < whorls; j++) {
    const count = countOf(j);
    const turn = (1 - s.spiral) * (Math.PI / count) + s.spiral * GOLDEN_ANGLE;
    const tint: [THREE.Color, THREE.Color] = [
      bloom.base.clone().offsetHSL(bloom.grand ? 0.02 * j : 0, 0, 0.04 * j),
      bloom.base
        .clone()
        .offsetHSL(g.hueSpan * (1 + (bloom.grand ? 0.3 * j : 0)), 0, 0.1 + 0.03 * j),
    ];
    for (let k = 0; k < count; k++) {
      const phi = (2 * Math.PI * k) / count + turn * j + (bloom.grand ? GOLDEN_ANGLE * j * 0.5 : 0);
      const front = Math.cos(phi);
      petal(
        b,
        bloom,
        frame,
        {
          phi,
          whorl: j,
          scale: 1 + 0.5 * s.bilateral * front,
          lip: s.bilateral * 0.9 * Math.max(0, front) + (bloom.grand ? grandCurl(j, whorls) : 0),
          order: orderOf(bloom, 0.1 + 0.55 * (j / whorls) + 0.15 * (k / count)),
        },
        grid,
        tint,
      );
    }
  }
}
