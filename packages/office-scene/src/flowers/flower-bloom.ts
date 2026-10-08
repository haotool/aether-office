import * as THREE from 'three';
import type { Genome } from './flower-genome.js';
import { KIND, MeshBuilder, type Style } from './flower-mesh.js';
import { GOLDEN_ANGLE, V3, orderOf, petals } from './flower-petals.js';
import { seeded } from '../environment/seeded.js';
import { itemAt } from '../environment/checked.js';

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

/** What the centre's parts share: the style of a glowing part, its two colours and the size of the disc. */
type CentreKit = {
  style: (color: THREE.Color, other: THREE.Color, order: number) => Style;
  white: THREE.Color;
  colorB: THREE.Color;
  disc: number;
};

function centreKit(bloom: Bloom, frame: THREE.Matrix4): CentreKit {
  const { genome: g, size } = bloom;
  const centre = V3(0, size * 0.02 + g.shape.float * size * 0.1, 0).applyMatrix4(frame);
  return {
    style: (color, other, order) => ({
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
    }),
    white: pale(bloom.base).lerp(new THREE.Color('#fff2c0'), 0.5),
    colorB: bloom.base.clone().offsetHSL(g.hueSpan, 0, 0.1),
    disc: size * g.shape.disc,
  };
}

/** A Vogel-spiral disc of florets (r = c sqrt(n), n x the golden angle), domed, with a soft light under the great bloom's. */
function florets(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4, low: boolean, kit: CentreKit) {
  const { genome: g, size } = bloom;
  const { style, white, colorB, disc } = kit;
  const count = low ? Math.min(g.florets, 21) : g.florets;
  const dome = disc * 0.5 + size * 0.08;
  for (let n = 1; n <= count; n++) {
    const radius = disc * Math.sqrt(n / count);
    const phi = n * GOLDEN_ANGLE;
    const height = dome * (1 - (radius / disc) ** 2) + size * 0.03;
    const position = V3(Math.cos(phi) * radius, height, Math.sin(phi) * radius).applyMatrix4(frame);
    const slope = V3(
      Math.cos(phi) * (radius / disc) * 0.6,
      1,
      Math.sin(phi) * (radius / disc) * 0.6,
    ).normalize();
    const spacing = (disc / Math.sqrt(count)) * 1.25;
    b.glowQuad(
      position,
      slope.transformDirection(frame),
      spacing,
      style(white.clone().lerp(colorB, n / count), colorB, 0.3),
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
}

/** Glowing stamens, each an arched thread ending in a bead. */
function stamens(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4, low: boolean, kit: CentreKit) {
  const { genome: g, size } = bloom;
  const { style, white, colorB } = kit;
  const random = seeded(`centre:${g.code}`);
  const count = low ? Math.min(g.filaments, 6) : g.filaments;
  for (let n = 0; n < count; n++) {
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
      itemAt(path, 3),
      dir.clone().transformDirection(frame),
      size * 0.05,
      style(white, colorB, 0.55),
    );
  }
}

/** The centre: a disc of florets and glowing stamens ending in beads. */
function centre(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4, low: boolean) {
  const kit = centreKit(bloom, frame);
  florets(b, bloom, frame, low, kit);
  stamens(b, bloom, frame, low, kit);
}

/** The great bloom's pistil: a tall glowing column with a bead of light at its tip, rising out of the stamens. */
function pistil(b: MeshBuilder, bloom: Bloom, frame: THREE.Matrix4) {
  const { genome: g, size } = bloom;
  const height = size * 0.55;
  const path = [0, 1, 2, 3, 4].map((t) =>
    V3(Math.sin(t * 0.9) * size * 0.015, (height * t) / 4 + size * 0.04, 0).applyMatrix4(frame),
  );
  const style: Style = {
    hinge: itemAt(path, 0),
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
  b.glowQuad(itemAt(path, 4), V3(0, 1, 0).transformDirection(frame), size * 0.09, {
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
