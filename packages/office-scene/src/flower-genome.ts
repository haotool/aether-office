/**
 * The flower genome: a deterministic map from a commit hash (and what happened around it) to the parameters of one flower.
 * Eight archetypes (lotus, orchid, lily, composite, tulip, helix, tech-lotus, crystal) are each a point in one shared space
 * of continuous shape parameters; a genome blends two of them by weight and jitters the result inside curated ranges, so the
 * variety is wide but every flower stays a believable flower. Pure: the same input always gives the same genome.
 */
import { seeded } from './random.js';

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

/** The continuous shape parameters every archetype defines and every genome blends. */
export const SHAPE_KEYS = [
  'pitch', // angle of the outer whorl's petals from the flower axis (0 upright, pi/2 flat)
  'pitchStep', // how much more upright each inner whorl is
  'curl', // how far a petal bends along its length (negative: inwards, positive: reflexed)
  'cup', // sideways bend of the petal's cross-section
  'ruffle', // wave along the petal edge
  'length', // petal length relative to the flower's size
  'width', // petal width relative to its length
  'taper', // where the petal is widest (above 1: towards the tip)
  'belly', // how blunt (below 1) or pointed (above 1) the petal is
  'twist', // turn of the petal about its own axis, radians over its length
  'spiral', // 0: whorls of evenly spaced petals, 1: each whorl turned by the golden angle
  'bilateral', // 0: radial symmetry, 1: a lip and a hood
  'float', // 0: petals joined at the base, 1: whorls drift apart as hovering shards
  'glass', // how translucent the petals are
  'facet', // 0: smooth petals, 1: cut like crystal
  'disc', // radius of the floret disc relative to the flower's size
  'filaments', // how many glowing stamens stand in the middle
  'veins', // how strongly the veins glow
] as const;
export type ShapeKey = (typeof SHAPE_KEYS)[number];
export type Shape = Record<ShapeKey, number>;

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
  Object.fromEntries(SHAPE_KEYS.map((k, i) => [k, v[i]!])) as Shape;

//                      pitch step  curl   cup  ruffle len  width taper belly twist spir  bil  float glass facet disc fil  veins
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

/** Petal counts a flower of each archetype may have (Fibonacci numbers: the counts real petals favour). */
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

/** Most petals one flower may carry, so its triangle count is bounded whatever the genome. */
export const MAX_PETALS = 34;
/** Floret counts of the Vogel disc: Fibonacci numbers, the more the wider the disc. */
const FLORETS = [13, 21, 34, 55, 89] as const;
/** The great bloom: thirteen or twenty-one petals in the outer whorl, thinning inwards, in five whorls. */
const GRAND_PETALS = [13, 13, 21] as const;
const GRAND_WHORLS = 5;

export type Genome = {
  /** A locale-neutral code name, e.g. "L-3C7A". */
  code: string;
  archetype: Archetype;
  /** One weight per archetype, in ARCHETYPES order; they sum to 1. */
  weights: number[];
  /** Picks the species' epithet (see flower-names.ts). */
  epithet: number;
  petals: number;
  whorls: number;
  shape: Shape;
  /** Florets in the Vogel-spiral disc. */
  florets: number;
  filaments: number;
  /** Orbiting pollen motes (none on low quality). */
  pollen: number;
  /** 0: none, 1: a thin ring, 2: a hovering disc beneath. */
  halo: 0 | 1 | 2;
  /** Hue turned from the branch colour to the petal tips, in turns (-0.5 to 0.5). */
  hueSpan: number;
  /** How far the stem leans outwards, 0 to 1. */
  lean: number;
  /** Side branches ending in buds (0 for most flowers). */
  twigs: number;
};

export type GenomeInput = {
  /** The commit hash (or any stable string) the flower grows from. */
  seed: string;
  merges: number;
  authors: number;
  branches: number;
  /** The final bloom on the spire: always full, with a halo and many motes. */
  grand?: boolean;
};

/**
 * How far the outer petals' tips stand from the flower's axis, in units of the flower's size: the horizontal run of the petal's
 * centreline (it bends by `curl` along its length, from `pitch`) added to where it starts. A flower below `MIN_SPREAD` reads as
 * a closed bud from the default camera distance.
 */
export function spreadOf(s: Shape, steps = 8): number {
  let run = 0;
  for (let i = 0; i < steps; i++) run += Math.sin(s.pitch + s.curl * ((i + 0.5) / steps)) / steps;
  return Math.max(0.05, s.disc * 0.8) + s.float * 0.22 + s.length * run;
}
/** The least spread a genome may have (see `spreadOf`). */
export const MIN_SPREAD = 0.62;

const clamp = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v));

/** The archetype weights: a primary, a secondary taking 12 to 45 percent of it, and nothing else. */
function blend(random: () => number): { weights: number[]; primary: number } {
  const primary = Math.floor(random() * ARCHETYPES.length);
  const secondary =
    (primary + 1 + Math.floor(random() * (ARCHETYPES.length - 1))) % ARCHETYPES.length;
  const mix = 0.12 + 0.33 * random();
  const weights = ARCHETYPES.map((_, i) => (i === primary ? 1 - mix : i === secondary ? mix : 0));
  return { weights, primary: mix > 0.5 ? secondary : primary };
}

export function genomeOf(input: GenomeInput): Genome {
  const random = seeded(`flower:${input.seed}`);
  const { weights, primary } = blend(random);
  const archetype = ARCHETYPES[primary]!;
  const shape = Object.fromEntries(
    SHAPE_KEYS.map((key) => {
      const mixed = ARCHETYPES.reduce((sum, a, i) => sum + weights[i]! * TABLE[a][key], 0);
      const range = SHAPE_RANGE[key];
      const jitter = (random() - 0.5) * 0.3 * (range[1] - range[0]);
      return [key, clamp(mixed + jitter, range)];
    }),
  ) as Shape;

  // No flower stays a closed bud: open the petals until the tips stand clear of the axis.
  while (spreadOf(shape) < MIN_SPREAD && shape.pitch < SHAPE_RANGE.pitch[1])
    shape.pitch = Math.min(SHAPE_RANGE.pitch[1], shape.pitch + 0.05);

  // The great bloom always opens wide, radially, with glassy veined petals and a firm step between its whorls.
  if (input.grand) {
    shape.pitch = Math.max(shape.pitch, 0.85);
    shape.curl = Math.max(shape.curl, -0.2);
    shape.bilateral = Math.min(shape.bilateral, 0.25);
    shape.pitchStep = Math.max(shape.pitchStep, 0.22);
    shape.glass = Math.max(shape.glass, 0.55);
    shape.veins = Math.max(shape.veins, 0.85);
    shape.length = Math.max(shape.length, 0.9);
    shape.disc = Math.min(shape.disc, 0.3);
  }
  const counts = input.grand ? GRAND_PETALS : PETALS[archetype];
  const petals =
    counts[
      Math.min(
        counts.length - 1,
        Math.floor(random() * counts.length) + (input.authors >= 3 ? 1 : 0),
      )
    ]!;
  const wanted = 1 + Math.floor(random() * 3) + (input.merges >= 2 ? 1 : 0) + (input.grand ? 1 : 0);
  const whorls = input.grand
    ? GRAND_WHORLS
    : Math.max(1, Math.min(wanted, 4, Math.floor(MAX_PETALS / petals)));
  const [discLow, discHigh] = SHAPE_RANGE.disc;
  const florets =
    FLORETS[
      Math.min(
        FLORETS.length - 1,
        Math.floor(((shape.disc - discLow) / (discHigh - discLow)) * FLORETS.length),
      )
    ]!;
  const code = `${archetype[0]!.toUpperCase()}-${Math.floor(random() * 65536)
    .toString(16)
    .toUpperCase()
    .padStart(4, '0')}`;
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
    halo: ringed ? (shape.float > 0.5 || random() < 0.4 ? 2 : 1) : 0,
    hueSpan: (random() < 0.5 ? -1 : 1) * (0.04 + 0.2 * random()),
    lean: 0.35 + 0.5 * random(),
    twigs: input.grand
      ? 0
      : input.merges >= 1
        ? Math.min(3, 1 + input.merges)
        : input.branches >= 3
          ? 2
          : 0,
  };
}
