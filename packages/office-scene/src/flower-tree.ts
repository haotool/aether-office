import * as THREE from 'three';
import { addBloom, type Bloom } from './flower-bloom.js';
import { KIND, MeshBuilder, type Style } from './flower-mesh.js';
import { seeded } from './random.js';
import type { Vec3 } from './stalk-types.js';

/** Twig segments and buds one garden may grow in all, so the trees stay a few hundred segments whatever the history. */
export const MAX_TWIG_SEGMENTS = 300;
export const MAX_BUDS = 40;

type TwigLimit = { segments: number; buds: number };
/** What each of `trees` flowers may grow so that together they stay inside the garden's limits (no tier starves another). */
export const twigShare = (trees: number): TwigLimit => ({
  segments: Math.floor(MAX_TWIG_SEGMENTS / Math.max(1, trees)),
  buds: Math.floor(MAX_BUDS / Math.max(1, trees)),
});

/** Attractor points per twig the flower asks for; a tree gets at most this many segments per twig too. */
const ATTRACTORS_PER_TWIG = 12;
const SEGMENTS_PER_TWIG = 16;
const MAX_ITERATIONS = 80;
const TROPISM = 0.18;
const up = new THREE.Vector3(0, 1, 0);

type Envelope = {
  /** The middle of the flat side of the hemisphere (on the deck); the points lie above it. */
  centre: Vec3;
  radius: number;
  /** Nothing grows towards the flower's own head. */
  avoid: Vec3;
  avoidRadius: number;
};
export type ColonyParams = {
  seed: string;
  /** Where the tree starts: nodes already standing (the lower stem), not counted as segments. */
  roots: Vec3[];
  envelope: Envelope;
  attractors: number;
  /** Length of one segment. */
  step: number;
  /** An attractor pulls the nearest node only within this distance. */
  influence: number;
  /** An attractor is reached (and removed) once a node comes this close. */
  kill: number;
  maxSegments: number;
};
type Colony = {
  /** The roots first, then every grown node in the order it appeared. */
  nodes: Vec3[];
  /** The node each one grew from (-1 for a root). */
  parent: number[];
  roots: number;
  attractors: number;
  /** How many attractors a node came within the kill distance of. */
  reached: number;
};

/** Points uniformly in the hemisphere above the envelope's centre, outside the avoided ball; deterministic from `random`. */
function scatter(random: () => number, count: number, e: Envelope): THREE.Vector3[] {
  const centre = new THREE.Vector3(...e.centre);
  const avoid = new THREE.Vector3(...e.avoid);
  const points: THREE.Vector3[] = [];
  for (let tries = 0; points.length < count && tries < count * 12; tries++) {
    const cosTheta = random();
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const phi = 2 * Math.PI * random();
    const radius = e.radius * Math.cbrt(random());
    const p = new THREE.Vector3(Math.cos(phi) * sinTheta, cosTheta, Math.sin(phi) * sinTheta)
      .multiplyScalar(radius)
      .add(centre);
    if (p.distanceTo(avoid) >= e.avoidRadius) points.push(p);
  }
  return points;
}

/**
 * Space colonization (Runions, Lane and Prusinkiewicz 2007), small and bounded: attractor points fill a hemispherical envelope;
 * each iteration every attractor pulls on the node nearest to it (inside the influence distance), every pulled node grows one
 * step towards the mean of its pulls (with a slight lean towards the light), and attractors a node has come close to are
 * removed. The tree ends when nothing is left to reach or `maxSegments` is spent. Pure: the same seed gives the same tree.
 */
export function colonize(p: ColonyParams): Colony {
  const random = seeded(`colony:${p.seed}`);
  let live = scatter(random, p.attractors, p.envelope);
  const total = live.length;
  const nodes = p.roots.map((r) => new THREE.Vector3(...r));
  const parent = nodes.map(() => -1);
  const roots = nodes.length;
  const killed = (a: THREE.Vector3, from: number) => {
    for (let i = from; i < nodes.length; i++)
      if (nodes[i]!.distanceToSquared(a) < p.kill * p.kill) return true;
    return false;
  };
  let reached = 0;
  for (let round = 0; round < MAX_ITERATIONS && live.length > 0; round++) {
    const pulls = new Map<number, THREE.Vector3>();
    const left: THREE.Vector3[] = [];
    for (const a of live) {
      let nearest = 0;
      let best = Infinity;
      nodes.forEach((n, i) => {
        const d = n.distanceToSquared(a);
        if (d < best) [nearest, best] = [i, d];
      });
      if (best < p.kill * p.kill) {
        reached++;
        continue;
      }
      left.push(a);
      if (best < p.influence * p.influence)
        pulls.set(
          nearest,
          (pulls.get(nearest) ?? new THREE.Vector3()).add(
            a.clone().sub(nodes[nearest]!).normalize(),
          ),
        );
    }
    live = left;
    if (pulls.size === 0) break;
    for (const [i, pull] of pulls) {
      if (nodes.length - roots >= p.maxSegments) break;
      const dir = pull.normalize().addScaledVector(up, TROPISM).normalize();
      nodes.push(nodes[i]!.clone().addScaledVector(dir, p.step));
      parent.push(i);
    }
    if (nodes.length - roots >= p.maxSegments) break;
  }
  reached += live.filter((a) => killed(a, 0)).length;
  return { nodes: nodes.map((n) => n.toArray()), parent, roots, attractors: total, reached };
}

/** Chains of single-parent nodes, each from the node it grew out of to the next fork or tip. */
function chainsOf(colony: Colony) {
  const children = colony.nodes.map(() => [] as number[]);
  colony.parent.forEach((p, i) => p >= 0 && children[p]!.push(i));
  // Tips below each node, so a limb is as thick as the number of tips it carries.
  const tips = colony.nodes.map(() => 0);
  for (let i = colony.nodes.length - 1; i >= 0; i--) {
    if (colony.parent[i]! < 0 && children[i]!.length === 0) continue;
    if (children[i]!.length === 0) tips[i] = 1;
    if (colony.parent[i]! >= 0) tips[colony.parent[i]!] = tips[colony.parent[i]!]! + tips[i]!;
  }
  const chains: { path: number[]; depth: number }[] = [];
  const walk = (start: number, depth: number) => {
    for (const first of children[start]!) {
      const path = [start, first];
      while (children[path[path.length - 1]!]!.length === 1)
        path.push(children[path[path.length - 1]!]![0]!);
      chains.push({ path, depth });
      const end = path[path.length - 1]!;
      if (children[end]!.length > 1) walk(end, depth + 1);
    }
  };
  for (let r = 0; r < colony.roots; r++) walk(r, 0);
  const total = tips.slice(0, colony.roots).reduce((a, c) => a + c, 0);
  return { chains, tips, children, total };
}

/**
 * The glass tree on a flower's stem: a space-colonized crown of twigs in a hemisphere over the deck the flower stands on, each
 * limb a glass tube (the stem's own shader) as thick as the tips it carries, every tip ending in a bud: the flower's own
 * five-petal bloom in miniature. Twigs grow before the buds open. Bounded by `limit` whatever the history; returns what it grew.
 */
export function growTwigs(
  b: MeshBuilder,
  bloom: Bloom,
  stem: THREE.Vector3[],
  limit: TwigLimit,
  low: boolean,
): { segments: number; buds: number } {
  const { genome: g, size } = bloom;
  if (g.twigs === 0 || limit.segments < 1) return { segments: 0, buds: 0 };
  const step = size * 0.24;
  const colony = colonize({
    seed: g.code,
    roots: stem.slice(2, 7).map((v) => v.toArray()),
    envelope: {
      centre: stem[3]!.toArray(),
      radius: size * 1.5,
      avoid: bloom.origin.toArray(),
      avoidRadius: size * 1.05,
    },
    attractors: Math.round(ATTRACTORS_PER_TWIG * g.twigs * (low ? 0.6 : 1)),
    step,
    influence: step * 5,
    kill: step * 1.2,
    maxSegments: Math.min(limit.segments, SEGMENTS_PER_TWIG * g.twigs),
  });
  const { chains, tips, children, total } = chainsOf(colony);
  const nodes = colony.nodes.map((n) => new THREE.Vector3(...n));
  const colorA = bloom.base.clone().lerp(new THREE.Color('#ffffff'), 0.3);
  const thick = (node: number) =>
    size * (0.008 + 0.016 * Math.sqrt(Math.max(1, tips[node]!) / Math.max(1, total)));
  for (const { path, depth } of chains) {
    const style: Style = {
      hinge: nodes[path[0]!]!,
      axis: new THREE.Vector3(1, 0, 0),
      swing: 0,
      order: Math.min(0.45, 0.05 + 0.08 * depth),
      flower: bloom.flower,
      kind: KIND.tube,
      colorA,
      colorB: bloom.base,
      detail: 0.8,
      glass: 0,
      sway: size * 0.1,
    };
    const from = thick(path[0]!);
    const to = thick(path[path.length - 1]!);
    b.tube(
      path.map((i) => nodes[i]!),
      (t) => from + (to - from) * t,
      3,
      style,
    );
  }
  // The farthest tips from the stem carry the buds: that is where the tree reaches out.
  const tipNodes = nodes
    .map((_, i) => i)
    .filter((i) => i >= colony.roots && children[i]!.length === 0)
    .sort((a, c) => nodes[c]!.distanceTo(stem[3]!) - nodes[a]!.distanceTo(stem[3]!) || a - c)
    .slice(0, limit.buds);
  for (const i of tipNodes) {
    const tip = nodes[i]!;
    const axis = tip
      .clone()
      .sub(nodes[colony.parent[i]!]!)
      .normalize()
      .addScaledVector(up, 0.6)
      .normalize();
    addBloom(
      b,
      {
        ...bloom,
        genome: {
          ...g,
          petals: 5,
          whorls: 1,
          shape: { ...g.shape, float: 0, cup: Math.max(g.shape.cup, 0.3) },
        },
        origin: tip,
        axis,
        size: size * 0.3,
        after: 0.5,
      },
      { low, bud: true },
    );
  }
  return { segments: colony.nodes.length - colony.roots, buds: tipNodes.length };
}
