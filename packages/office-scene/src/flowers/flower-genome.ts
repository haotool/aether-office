import { seeded } from '../environment/seeded.js';
import { itemAt } from '../environment/checked.js';

export const ARCHETYPES = [
  'lotus',
  'orchid',
  'lily',
  'composite',
  'tulip',
  'helix',
  'techLotus',
  'crystal',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export const SHAPE_KEYS = [
  'pitch',
  'pitchStep',
  'curl',
  'cup',
  'ruffle',
  'length',
  'width',
  'taper',
  'belly',
  'twist',
  'spiral',
  'bilateral',
  'float',
  'glass',
  'facet',
  'disc',
  'filaments',
  'veins',
] as const;
type ShapeKey = (typeof SHAPE_KEYS)[number];
type Shape = Record<ShapeKey, number>;

export const SHAPE_RANGE: Record<ShapeKey, [number, number]> = {
  pitch: [0.4, 1.5],
  pitchStep: [0, 0.45],
  curl: [-0.55, 1.1],
  cup: [0, 0.7],
  ruffle: [0, 0.45],
  length: [0.6, 1.4],
  width: [0.12, 0.7],
  taper: [0.55, 1.5],
  belly: [0.5, 1.3],
  twist: [0, 2.6],
  spiral: [0, 1],
  bilateral: [0, 1],
  float: [0, 1],
  glass: [0, 1],
  facet: [0, 1],
  disc: [0.08, 0.5],
  filaments: [0, 1],
  veins: [0.2, 1],
};

const row = (...v: number[]): Shape =>
  Object.fromEntries(SHAPE_KEYS.map((k, i) => [k, itemAt(v, i)])) as Shape;

const TABLE: Record<Archetype, Shape> = {
  lotus: row(
    0.68,
    0.17,
    -0.35,
    0.4,
    0.02,
    1.0,
    0.42,
    0.85,
    0.8,
    0.1,
    0.6,
    0,
    0,
    0.35,
    0,
    0.2,
    0.5,
    0.7,
  ),
  orchid: row(
    1.15,
    0.2,
    0.25,
    0.25,
    0.32,
    0.85,
    0.46,
    0.8,
    0.7,
    0.15,
    0,
    1,
    0,
    0.45,
    0,
    0.12,
    0.15,
    1,
  ),
  lily: row(0.75, 0.1, 0.85, 0.15, 0.1, 1.15, 0.22, 1.1, 0.9, 0.25, 0.2, 0, 0, 0.3, 0, 0.1, 1, 0.8),
  composite: row(1.4, 0.05, 0.12, 0.05, 0, 0.95, 0.15, 1.0, 0.6, 0, 1, 0, 0, 0.2, 0, 0.42, 0, 0.4),
  tulip: row(
    0.62,
    0.08,
    -0.12,
    0.42,
    0,
    1.05,
    0.55,
    0.7,
    0.75,
    0,
    0.3,
    0,
    0,
    0.25,
    0,
    0.1,
    0.3,
    0.6,
  ),
  helix: row(0.95, 0.2, -0.35, 0.3, 0.05, 1.2, 0.2, 1.3, 0.6, 2.2, 1, 0, 0, 0.5, 0, 0.12, 0.7, 0.9),
  techLotus: row(
    0.7,
    0.2,
    -0.15,
    0.1,
    0,
    0.9,
    0.38,
    0.9,
    1.0,
    0,
    0.5,
    0,
    0.9,
    0.8,
    0.3,
    0.2,
    0.4,
    1,
  ),
  crystal: row(
    0.62,
    0.15,
    -0.1,
    0.05,
    0,
    1.0,
    0.3,
    1.4,
    1.2,
    0.3,
    0.4,
    0,
    0.1,
    1,
    1,
    0.15,
    0.2,
    0.3,
  ),
};

const PETALS: Record<Archetype, readonly number[]> = {
  lotus: [8, 13, 21],
  orchid: [3, 5],
  lily: [5, 8],
  composite: [13, 21],
  tulip: [3, 5, 8],
  helix: [8, 13],
  techLotus: [5, 8, 13],
  crystal: [5, 8, 13],
};

export const MAX_PETALS = 34;
const FLORETS = [13, 21, 34, 55, 89] as const;
const GRAND_PETALS = [13, 13, 21] as const;
const GRAND_WHORLS = 5;

export type Genome = {
  code: string;
  archetype: Archetype;
  weights: number[];
  epithet: number;
  petals: number;
  whorls: number;
  shape: Shape;
  florets: number;
  filaments: number;
  pollen: number;
  halo: 0 | 1 | 2;
  hueSpan: number;
  lean: number;
  twigs: number;
};

type GenomeInput = {
  seed: string;
  merges: number;
  authors: number;
  branches: number;
  grand?: boolean;
};

export function spreadOf(s: Shape, steps = 8): number {
  let run = 0;
  for (let i = 0; i < steps; i++) run += Math.sin(s.pitch + s.curl * ((i + 0.5) / steps)) / steps;
  return Math.max(0.05, s.disc * 0.8) + s.float * 0.22 + s.length * run;
}
export const MIN_SPREAD = 0.62;

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

function blend(random: () => number): { weights: number[]; primary: number } {
  const primary = Math.floor(random() * ARCHETYPES.length);
  const secondary =
    (primary + 1 + Math.floor(random() * (ARCHETYPES.length - 1))) % ARCHETYPES.length;
  const mix = 0.12 + 0.33 * random();
  const weights = ARCHETYPES.map((_, i) => (i === primary ? 1 - mix : i === secondary ? mix : 0));
  return { weights, primary: mix > 0.5 ? secondary : primary };
}

function mixShape(weights: readonly number[], random: () => number): Shape {
  return Object.fromEntries(
    SHAPE_KEYS.map((key) => {
      const mixed = ARCHETYPES.reduce((sum, a, i) => sum + itemAt(weights, i) * TABLE[a][key], 0);
      const range = SHAPE_RANGE[key];
      const jitter = (random() - 0.5) * 0.3 * (range[1] - range[0]);
      return [key, clamp(mixed + jitter, range)];
    }),
  ) as Shape;
}

function openShape(shape: Shape, grand: boolean): void {
  while (spreadOf(shape) < MIN_SPREAD && shape.pitch < SHAPE_RANGE.pitch[1])
    shape.pitch = Math.min(SHAPE_RANGE.pitch[1], shape.pitch + 0.05);
  if (!grand) return;
  shape.pitch = Math.max(shape.pitch, 0.85);
  shape.curl = Math.max(shape.curl, -0.2);
  shape.bilateral = Math.min(shape.bilateral, 0.25);
  shape.pitchStep = Math.max(shape.pitchStep, 0.22);
  shape.glass = Math.max(shape.glass, 0.55);
  shape.veins = Math.max(shape.veins, 0.85);
  shape.length = Math.max(shape.length, 0.9);
  shape.disc = Math.min(shape.disc, 0.3);
}

function floretsFor(disc: number): number {
  const [low, high] = SHAPE_RANGE.disc;
  return itemAt(
    FLORETS,
    Math.min(FLORETS.length - 1, Math.floor(((disc - low) / (high - low)) * FLORETS.length)),
  );
}

const codeOf = (archetype: Archetype, random: () => number) =>
  `${archetype.charAt(0).toUpperCase()}-${Math.floor(random() * 65536)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0')}`;

function petalCount(input: GenomeInput, counts: readonly number[], random: () => number) {
  return itemAt(
    counts,
    Math.min(
      counts.length - 1,
      Math.floor(random() * counts.length) + (input.authors >= 3 ? 1 : 0),
    ),
  );
}

function whorlCount(input: GenomeInput, petals: number, random: () => number) {
  const wanted = 1 + Math.floor(random() * 3) + (input.merges >= 2 ? 1 : 0) + (input.grand ? 1 : 0);
  return input.grand
    ? GRAND_WHORLS
    : Math.max(1, Math.min(wanted, 4, Math.floor(MAX_PETALS / petals)));
}

function haloLevel(shape: Genome['shape'], ringed: boolean, random: () => number) {
  if (!ringed) return 0;
  return shape.float > 0.5 || random() < 0.4 ? 2 : 1;
}

function twigCount(input: GenomeInput) {
  if (input.grand) return 0;
  if (input.merges >= 1) return Math.min(3, 1 + input.merges);
  return input.branches >= 3 ? 2 : 0;
}

export function genomeOf(input: GenomeInput): Genome {
  const random = seeded(`flower:${input.seed}`);
  const { weights, primary } = blend(random);
  const archetype = itemAt(ARCHETYPES, primary);
  const shape = mixShape(weights, random);
  openShape(shape, !!input.grand);
  const counts = input.grand ? GRAND_PETALS : PETALS[archetype];
  const petals = petalCount(input, counts, random);
  const whorls = whorlCount(input, petals, random);
  const florets = floretsFor(shape.disc);
  const code = codeOf(archetype, random);
  const ringed = input.grand || input.branches >= 4 || random() < 0.1;
  return {
    code,
    archetype,
    weights,
    epithet: Math.floor(random() * 24),
    petals,
    whorls,
    shape,
    florets: input.grand ? 89 : florets,
    filaments: input.grand ? 34 : Math.round(shape.filaments * (6 + 10 * random())),
    pollen: input.grand ? 72 : 6 + Math.floor(random() * 10) + Math.min(10, input.authors * 2),
    halo: haloLevel(shape, ringed, random),
    hueSpan: (random() < 0.5 ? -1 : 1) * (0.04 + 0.2 * random()),
    lean: 0.35 + 0.5 * random(),
    twigs: twigCount(input),
  };
}
