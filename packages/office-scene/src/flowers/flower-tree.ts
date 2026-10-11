import * as THREE from 'three';
import { addBloom, type Bloom } from './flower-bloom.js';
import { KIND, MeshBuilder, type Style } from './flower-mesh.js';
import { seeded } from '../environment/seeded.js';
import type { Vec3 } from '../core/stalk-types.js';
import { itemAt, lastOf } from '../environment/checked.js';

export const MAX_TWIG_SEGMENTS = 300;
export const MAX_BUDS = 40;

type TwigLimit = { segments: number; buds: number };
export const twigShare = (trees: number): TwigLimit => ({
  segments: Math.floor(MAX_TWIG_SEGMENTS / Math.max(1, trees)),
  buds: Math.floor(MAX_BUDS / Math.max(1, trees)),
});

const ATTRACTORS_PER_TWIG = 12;
const SEGMENTS_PER_TWIG = 16;
const MAX_ITERATIONS = 80;
const TROPISM = 0.18;
const up = new THREE.Vector3(0, 1, 0);

type Envelope = {
  centre: Vec3;
  radius: number;
  avoid: Vec3;
  avoidRadius: number;
};
export type ColonyParams = {
  seed: string;
  roots: Vec3[];
  envelope: Envelope;
  attractors: number;
  step: number;
  influence: number;
  kill: number;
  maxSegments: number;
};
type Colony = {
  nodes: Vec3[];
  parent: number[];
  roots: number;
  attractors: number;
  reached: number;
};

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

type ColonizeCtx = {
  nodes: THREE.Vector3[];
  parent: number[];
  roots: number;
  p: ColonyParams;
};

const nearestNodeIndex = (nodes: THREE.Vector3[], a: THREE.Vector3) => {
  let nearest = 0;
  let best = Infinity;
  nodes.forEach((n, i) => {
    const d = n.distanceToSquared(a);
    if (d < best) [nearest, best] = [i, d];
  });
  return { nearest, best };
};

function colonizePulls(ctx: ColonizeCtx, attractors: THREE.Vector3[]) {
  const pulls = new Map<number, THREE.Vector3>();
  const left: THREE.Vector3[] = [];
  let reachedNow = 0;
  const kill2 = ctx.p.kill * ctx.p.kill;
  const influence2 = ctx.p.influence * ctx.p.influence;
  for (const a of attractors) {
    const { nearest, best } = nearestNodeIndex(ctx.nodes, a);
    if (best < kill2) {
      reachedNow++;
      continue;
    }
    left.push(a);
    if (best < influence2)
      pulls.set(
        nearest,
        (pulls.get(nearest) ?? new THREE.Vector3()).add(
          a.clone().sub(itemAt(ctx.nodes, nearest)).normalize(),
        ),
      );
  }
  return { pulls, left, reachedNow };
}

function colonizeGrow(ctx: ColonizeCtx, pulls: Map<number, THREE.Vector3>) {
  for (const [i, pull] of pulls) {
    if (ctx.nodes.length - ctx.roots >= ctx.p.maxSegments) return true;
    const dir = pull.normalize().addScaledVector(up, TROPISM).normalize();
    ctx.nodes.push(itemAt(ctx.nodes, i).clone().addScaledVector(dir, ctx.p.step));
    ctx.parent.push(i);
  }
  return ctx.nodes.length - ctx.roots >= ctx.p.maxSegments;
}

export function colonize(p: ColonyParams): Colony {
  const random = seeded(`colony:${p.seed}`);
  let live = scatter(random, p.attractors, p.envelope);
  const total = live.length;
  const nodes = p.roots.map((r) => new THREE.Vector3(...r));
  const parent = nodes.map(() => -1);
  const roots = nodes.length;
  const ctx: ColonizeCtx = { nodes, parent, roots, p };
  const killed = (a: THREE.Vector3, from: number) => {
    for (let i = from; i < nodes.length; i++)
      if (itemAt(nodes, i).distanceToSquared(a) < p.kill * p.kill) return true;
    return false;
  };
  let reached = 0;
  for (let round = 0; round < MAX_ITERATIONS && live.length > 0; round++) {
    const { pulls, left, reachedNow } = colonizePulls(ctx, live);
    reached += reachedNow;
    live = left;
    if (pulls.size === 0) break;
    if (colonizeGrow(ctx, pulls)) break;
  }
  reached += live.filter((a) => killed(a, 0)).length;
  return { nodes: nodes.map((n) => n.toArray()), parent, roots, attractors: total, reached };
}

function chainsOf(colony: Colony) {
  const children = colony.nodes.map(() => [] as number[]);
  colony.parent.forEach((p, i) => p >= 0 && itemAt(children, p).push(i));
  const tips = colony.nodes.map(() => 0);
  for (let i = colony.nodes.length - 1; i >= 0; i--) {
    const parent = itemAt(colony.parent, i);
    const leaf = itemAt(children, i).length === 0;
    if (parent < 0 && leaf) continue;
    if (leaf) tips[i] = 1;
    if (parent >= 0) tips[parent] = itemAt(tips, parent) + itemAt(tips, i);
  }
  const chains: { path: number[]; depth: number }[] = [];
  const walk = (start: number, depth: number) => {
    for (const first of itemAt(children, start)) {
      const path = [start, first];
      let end = first;
      while (itemAt(children, end).length === 1) {
        end = itemAt(itemAt(children, end), 0);
        path.push(end);
      }
      chains.push({ path, depth });
      if (itemAt(children, end).length > 1) walk(end, depth + 1);
    }
  };
  for (let r = 0; r < colony.roots; r++) walk(r, 0);
  const total = tips.slice(0, colony.roots).reduce((a, c) => a + c, 0);
  return { chains, tips, children, total };
}

function twigTubes(
  b: MeshBuilder,
  bloom: Bloom,
  nodes: readonly THREE.Vector3[],
  { chains, tips, total }: ReturnType<typeof chainsOf>,
) {
  const { size } = bloom;
  const colorA = bloom.base.clone().lerp(new THREE.Color('#ffffff'), 0.3);
  const thick = (node: number) =>
    size * (0.008 + 0.016 * Math.sqrt(Math.max(1, itemAt(tips, node)) / Math.max(1, total)));
  for (const { path, depth } of chains) {
    const style: Style = {
      hinge: itemAt(nodes, itemAt(path, 0)),
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
    const from = thick(itemAt(path, 0));
    const to = thick(lastOf(path));
    b.tube(
      path.map((i) => itemAt(nodes, i)),
      (t) => from + (to - from) * t,
      3,
      style,
    );
  }
}

function twigBuds(
  b: MeshBuilder,
  bloom: Bloom,
  colony: Colony,
  nodes: readonly THREE.Vector3[],
  children: readonly number[][],
  { crown, buds, low }: { crown: THREE.Vector3; buds: number; low: boolean },
): number {
  const { genome: g, size } = bloom;
  const tipNodes = nodes
    .map((_, i) => i)
    .filter((i) => i >= colony.roots && itemAt(children, i).length === 0)
    .sort(
      (a, c) => itemAt(nodes, c).distanceTo(crown) - itemAt(nodes, a).distanceTo(crown) || a - c,
    )
    .slice(0, buds);
  for (const i of tipNodes) {
    const tip = itemAt(nodes, i);
    const axis = tip
      .clone()
      .sub(itemAt(nodes, itemAt(colony.parent, i)))
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
  return tipNodes.length;
}

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
  const crown = itemAt(stem, 3);
  const colony = colonize({
    seed: g.code,
    roots: stem.slice(2, 7).map((v) => v.toArray()),
    envelope: {
      centre: crown.toArray(),
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
  const chains = chainsOf(colony);
  const nodes = colony.nodes.map((n) => new THREE.Vector3(...n));
  twigTubes(b, bloom, nodes, chains);
  const buds = twigBuds(b, bloom, colony, nodes, chains.children, { crown, buds: limit.buds, low });
  return { segments: colony.nodes.length - colony.roots, buds };
}
