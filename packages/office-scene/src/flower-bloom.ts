import * as THREE from 'three';
import type { Genome } from './flower-genome.js';
import { KIND, MeshBuilder, type Style } from './flower-mesh.js';
import { seeded } from './random.js';

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** One flower to draw: where it stands, which way it faces, how big, and in what colours. */
export type Bloom = {
  genome: Genome;
  /** Index into the shader's `open` array: which tier's bloom this belongs to. */
  flower: number;
  origin: THREE.Vector3;
  axis: THREE.Vector3;
  /** Petal length scale in metres. */
  size: number;
  base: THREE.Color;
  /** The great bloom on the spire: more whorls, finer petals, a pistil and three rings. */
  grand?: boolean;
  /** 0 to 1: the share of the bloom that passes before this flower's first part appears (buds open after their twigs grew). */
  after?: number;
};

/** A part's `order` (how late in the bloom it appears), 0 to 1 within the flower's own share of the bloom. */
export const orderOf = (bloom: Bloom, x: number) =>
  (bloom.after ?? 0) + (1 - (bloom.after ?? 0)) * x;

const pale = (c: THREE.Color) => c.clone().lerp(new THREE.Color('#ffffff'), 0.7);

/** Local flower frame: +Y along the axis. */
function frameOf(origin: THREE.Vector3, axis: THREE.Vector3) {
  const y = axis.clone().normalize();
  const x = new THREE.Vector3()
    .crossVectors(y, Math.abs(y.y) > 0.99 ? V3(1, 0, 0) : V3(0, 1, 0))
    .normalize();
  const z = new THREE.Vector3().crossVectors(x, y);
  return new THREE.Matrix4().makeBasis(x, y, z).setPosition(origin);
}

type Petal = { phi: number; whorl: number; scale: number; lip: number; order: number };

/** One petal as a grid of points: the centerline bends by `curl`, the cross-section cups, the edge ruffles, the whole twists. */
function petal(
  b: MeshBuilder,
  bloom: Bloom,
  frame: THREE.Matrix4,
  p: Petal,
  grid: [number, number],
  tint: [THREE.Color, THREE.Color],
) {
  const { genome: g, size } = bloom;
  const s = g.shape;
  const [cols, rows] = grid;
  const length = size * s.length * p.scale * (1 - 0.18 * p.whorl);
  const wmax = length * s.width;
  const r0 = size * Math.max(0.05, s.disc * 0.8) + s.float * size * 0.22;
  const h0 = s.float * size * 0.28 * p.whorl + (bloom.grand ? size * 0.07 * p.whorl : 0);
  const theta0 = Math.max(0.03, s.pitch - s.pitchStep * p.whorl);
  const er = V3(Math.cos(p.phi), 0, Math.sin(p.phi));
  const ey = V3(0, 1, 0);
  const et = V3(-Math.sin(p.phi), 0, Math.cos(p.phi));
  // The centerline, row by row.
  const along = Array.from({ length: cols }, (_, i) => i / (cols - 1));
  let r = r0;
  let y = h0;
  const centers = along.map((u, i) => {
    if (i > 0) {
      const theta = theta0 + (s.curl + p.lip) * (u - 0.5 / (cols - 1));
      r += (length / (cols - 1)) * Math.sin(theta);
      y += (length / (cols - 1)) * Math.cos(theta);
    }
    return { r, y, theta: theta0 + (s.curl + p.lip) * u };
  });
  const point = (i: number, j: number) => {
    const u = along[i]!;
    const v = -1 + (2 * j) / (rows - 1);
    const { r, y, theta } = centers[i]!;
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
    positions[Math.min(cols - 1, Math.max(0, i)) * rows + Math.min(rows - 1, Math.max(0, j))]!;
  const hinge = er.clone().multiplyScalar(r0).addScaledVector(ey, h0).applyMatrix4(frame);
  const style: Style = {
    hinge,
    axis: et.clone().transformDirection(frame),
    swing: Math.max(0, theta0 - 0.06),
    order: p.order,
    flower: bloom.flower,
    kind: KIND.petal,
    colorA: tint[0],
    colorB: tint[1],
    detail: s.veins,
    glass: s.glass,
    sway: size * 0.1,
  };
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
        along[i]!,
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

/** The petals: whorls of `petals` each, each whorl turned from the last (evenly, or by the golden angle), outer ones first. */
function petals(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4, low: boolean, bud: boolean) {
  const { genome: g } = bloom;
  const s = g.shape;
  const whorls = bud ? 1 : g.whorls;
  // The great bloom thins its whorls towards the centre and draws each petal finer.
  const countOf = (j: number) =>
    bud ? 5 : bloom.grand ? Math.max(5, Math.round(g.petals * (1 - 0.17 * j))) : g.petals;
  const grid: [number, number] = bud
    ? [4, 2]
    : bloom.grand
      ? low
        ? [6, 4]
        : [11, 6]
      : s.facet > 0.5
        ? [4, 3]
        : low
          ? [4, 3]
          : [7, 4];
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

/** The centre: a Vogel-spiral disc of florets (r = c sqrt(n), n x the golden angle) and glowing stamens ending in beads. */
function centre(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4, low: boolean) {
  const { genome: g, size } = bloom;
  const random = seeded(`centre:${g.code}`);
  const disc = size * g.shape.disc;
  const florets = low ? Math.min(g.florets, 21) : g.florets;
  const dome = disc * 0.5 + size * 0.08;
  const colorB = bloom.base.clone().offsetHSL(g.hueSpan, 0, 0.1);
  const centre = V3(0, size * 0.02 + g.shape.float * size * 0.1, 0).applyMatrix4(frame);
  const style = (color: THREE.Color, other: THREE.Color, order: number): Style => ({
    hinge: centre,
    axis: V3(1, 0, 0),
    swing: 0,
    order: orderOf(bloom, order),
    flower: bloom.flower,
    kind: KIND.glow,
    colorA: color,
    colorB: other,
    detail: bloom.grand ? 0.55 : 0.9,
    glass: 0,
    sway: size * 0.1,
  });
  const white = pale(bloom.base).lerp(new THREE.Color('#fff2c0'), 0.5);
  for (let n = 1; n <= florets; n++) {
    const radius = disc * Math.sqrt(n / florets);
    const phi = n * GOLDEN_ANGLE;
    const height = dome * (1 - (radius / disc) ** 2) + size * 0.03;
    const position = V3(Math.cos(phi) * radius, height, Math.sin(phi) * radius).applyMatrix4(frame);
    const slope = V3(
      Math.cos(phi) * (radius / disc) * 0.6,
      1,
      Math.sin(phi) * (radius / disc) * 0.6,
    ).normalize();
    const spacing = (disc / Math.sqrt(florets)) * 1.25;
    b.glowQuad(
      position,
      slope.transformDirection(frame),
      spacing,
      style(white.clone().lerp(colorB, n / florets), colorB, 0.3),
    );
  }
  // The great bloom's heart: a soft disc of light under the florets, so the middle is never a dark hole.
  if (bloom.grand)
    b.glowQuad(
      V3(0, size * 0.05, 0).applyMatrix4(frame),
      V3(0, 1, 0).transformDirection(frame),
      disc * 2.8,
      { ...style(colorB.clone().lerp(white, 0.3), colorB, 0.25), detail: 1.1 },
    );
  const stamens = low ? Math.min(g.filaments, 6) : g.filaments;
  for (let n = 0; n < stamens; n++) {
    const phi = n * GOLDEN_ANGLE;
    const lean = 0.15 + 0.5 * random();
    const length = size * (0.35 + 0.35 * random());
    const dir = V3(Math.sin(lean) * Math.cos(phi), Math.cos(lean), Math.sin(lean) * Math.sin(phi));
    const arch = V3(-Math.cos(phi), 0, -Math.sin(phi)).multiplyScalar(length * 0.25);
    const path = [0, 1, 2, 3].map((t) =>
      dir
        .clone()
        .multiplyScalar((length * t) / 3)
        .addScaledVector(arch, (t / 3) ** 2)
        .add(V3(0, size * 0.04, 0))
        .applyMatrix4(frame),
    );
    const tube = {
      ...style(
        bloom.grand ? bloom.base.clone().lerp(new THREE.Color('#ffffff'), 0.35) : pale(bloom.base),
        bloom.base,
        0.5,
      ),
      kind: KIND.tube,
      detail: bloom.grand ? 0.5 : 1,
    };
    b.tube(path, (t) => size * 0.012 * (1 - 0.5 * t), 3, tube);
    b.glowQuad(
      path[3]!,
      dir.clone().transformDirection(frame),
      size * 0.05,
      style(white, colorB, 0.55),
    );
  }
}

/** The great bloom's pistil: a tall glowing column with a bead of light at its tip, rising out of the stamens. */
function pistil(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4) {
  const { genome: g, size } = bloom;
  const height = size * 0.55;
  const path = [0, 1, 2, 3, 4].map((t) =>
    V3(Math.sin(t * 0.9) * size * 0.015, (height * t) / 4 + size * 0.04, 0).applyMatrix4(frame),
  );
  const style: Style = {
    hinge: path[0]!,
    axis: V3(1, 0, 0),
    swing: 0,
    order: orderOf(bloom, 0.6),
    flower: bloom.flower,
    kind: KIND.tube,
    colorA: bloom.base.clone().lerp(new THREE.Color('#ffffff'), 0.35),
    colorB: bloom.base.clone().offsetHSL(g.hueSpan, 0, 0.15),
    detail: 0.5,
    glass: 0,
    sway: size * 0.1,
  };
  b.tube(path, (t) => size * 0.022 * (1 - 0.6 * t), 4, style);
  b.glowQuad(path[4]!, V3(0, 1, 0).transformDirection(frame), size * 0.09, {
    ...style,
    kind: KIND.glow,
    order: orderOf(bloom, 0.7),
    colorA: pale(bloom.base).lerp(new THREE.Color('#fff2c0'), 0.6),
    detail: 1,
  });
}

/** A ring or a hovering band round the flower, flat across its axis. */
function halo(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4, band: boolean, wide = 1) {
  const { genome: g, size } = bloom;
  const reach = wide * size * (g.shape.length * Math.sin(g.shape.pitch) + 0.25);
  const inner = band ? reach * 0.55 : reach * 1.12;
  const outer = band ? reach * 1.1 : reach * 1.17;
  const y = band ? -size * 0.12 : size * (0.45 + 0.3 * (wide - 1));
  const style: Style = {
    hinge: V3(0, y, 0).applyMatrix4(frame),
    axis: V3(1, 0, 0),
    swing: 0,
    order: orderOf(bloom, 0.95),
    flower: bloom.flower,
    kind: KIND.glow,
    colorA: bloom.base.clone().offsetHSL(g.hueSpan, 0, 0.1),
    colorB: bloom.base,
    detail: (band ? 0.22 : 0.8) / (bloom.grand && (band || wide > 1) ? 1.8 : 1),
    glass: 0,
    sway: size * 0.1,
  };
  const up = V3(0, 1, 0).transformDirection(frame);
  const segments = 56;
  b.grid(
    segments + 1,
    3,
    (i, j) => {
      const a = (2 * Math.PI * i) / segments;
      const radius = inner + ((outer - inner) * j) / 2;
      return {
        p: V3(Math.cos(a) * radius, y, Math.sin(a) * radius).applyMatrix4(frame),
        n: up,
        u: 0,
        v: -1 + j,
      };
    },
    style,
  );
}

/** One whole flower, appended to the builder. `low` thins it; a `bud` is the five-petal flower at the end of a twig. */
export function addBloom(b: MeshBuilder, bloom: Bloom, { low = false, bud = false } = {}) {
  const frame = frameOf(bloom.origin, bloom.axis);
  petals(b, bloom, frame, low, bud);
  if (bud) return;
  centre(b, bloom, frame, low);
  if (bloom.grand) {
    pistil(b, bloom, frame);
    // A holographic crown of three rings: a thin ring over the petals, a hovering band under them and a wide faint ring round.
    halo(b, bloom, frame, false);
    halo(b, bloom, frame, true);
    halo(b, bloom, frame, false, 1.35);
  } else if (bloom.genome.halo > 0) halo(b, bloom, frame, bloom.genome.halo === 2);
}
