import * as THREE from 'three';
import type { Bloom } from './flower-bloom.js';
import { genomeOf, type Genome } from './flower-genome.js';
import { seeded } from './random.js';
import { PALETTE } from './stalk-layout.js';
import type { Stalk, StalkNode } from './stalk-types.js';

/** Recent merge commits that bloom a small flower on the braid, newest first. */
export const MAX_MERGE_FLOWERS = 16;
/** Petals a merge flower may have: it is small, so a few big petals read better than many. */
const MAX_MERGE_PETALS = 13;
/** How far from the axis (metres) a flower stands, so it clears the strand's bead and stays inside the core's glass. */
const STAND_OFF = 0.3;
const MAX_REACH = 1.1;

/** The branch colour, richer and a little darker, so a flower stands out from the bright glass behind it. */
export const flowerColor = (css: THREE.ColorRepresentation) => {
  const hsl = { h: 0, s: 0, l: 0 };
  new THREE.Color(css).getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, Math.max(hsl.s, 0.85), Math.min(hsl.l, 0.55));
};

/** A smaller-scale genome: one whorl, at most 13 petals, no halo, pollen or twigs and a few stamens. */
const smallOf = (g: Genome): Genome => ({
  ...g,
  petals: Math.min(g.petals, MAX_MERGE_PETALS),
  whorls: 1,
  halo: 0,
  pollen: 0,
  twigs: 0,
  filaments: Math.min(g.filaments, 4),
});

type MergeStand = { bloom: Bloom; node: StalkNode };

/**
 * One small flower for each of the newest merge commits (at most `MAX_MERGE_FLOWERS`), grown from the commit's hash and
 * standing at its node on the strand, leaning outwards so it shows through the glass of the core. `first` is the shader index
 * of the first of them. Pure: the same stalk always gives the same flowers.
 */
export function mergeStands(stalk: Stalk, first: number): MergeStand[] {
  return stalk.nodes
    .filter((n) => n.merge)
    .slice(0, MAX_MERGE_FLOWERS)
    .map((node, i) => {
      const random = seeded(`merge:${node.sha}`);
      const [x, y, z] = node.position;
      const heading = Math.hypot(x, z) > 0.05 ? Math.atan2(z, x) : 2 * Math.PI * random();
      const out = new THREE.Vector3(Math.cos(heading), 0, Math.sin(heading));
      const reach = Math.min(MAX_REACH, Math.hypot(x, z) + STAND_OFF);
      const origin = out.clone().multiplyScalar(reach).setY(y);
      const bloom: Bloom = {
        genome: smallOf(genomeOf({ seed: node.sha, merges: 0, authors: 1, branches: 1 })),
        flower: first + i,
        origin,
        axis: out
          .clone()
          .add(new THREE.Vector3(0, 0.35, 0))
          .normalize(),
        size: 0.6 + 0.25 * random(),
        base: flowerColor(PALETTE[node.strand % PALETTE.length]!),
      };
      return { bloom, node };
    });
}
