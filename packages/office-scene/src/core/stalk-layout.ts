import { itemAt, lastOf, valueOf } from '../environment/checked.js';
import { crownTop, layoutTiers, SPIRE_HEIGHT } from './crown-layout.js';
import type { Stalk, StalkCommit, StalkNode, Strand, Vec3 } from './stalk-types.js';

export type {
  Stalk,
  StalkCommit,
  StalkNode,
  Strand,
  Tier,
  TierShape,
  Vec3,
} from './stalk-types.js';

export const MAX_STRANDS = 8;
export const PALETTE = [
  '#7dff6a',
  '#43e6df',
  '#a592ff',
  '#ffc65c',
  '#ff7a85',
  '#6aa8ff',
  '#ff6fd8',
  '#f6ad55',
] as const;
export const paletteAt = (strand: number): string => PALETTE[strand % PALETTE.length] ?? PALETTE[0];

export const CORE_RADIUS = 1.5;
const INSIDE = 0.9;
const OUTSIDE = 2.2;
const TIP = 0.5;
export const MAX_BRAID_RADIUS = 3;
const FLARE = 10;
const BASE_Y = -1.3;
const FIRST_COMMIT_Y = 0.6;
const PITCH = 14;
const BOOST = 2;
const RECENT_DAYS = 14;
const FORK_RAMP = 6;
const STEP = 0.4;
const DAY = 86_400_000;

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));
const smooth = (t: number) => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

type Sample = { y: number; phase: number; spread: number };
const lerp = (a: Sample, b: Sample, t: number): Sample => ({
  y: a.y + (b.y - a.y) * t,
  phase: a.phase + (b.phase - a.phase) * t,
  spread: a.spread + (b.spread - a.spread) * t,
});
const nearest = (from: Sample, to: Sample): Sample => ({
  ...to,
  phase: to.phase + 2 * Math.PI * Math.round((from.phase - to.phase) / (2 * Math.PI)),
});

function braid({ y, phase, spread }: Sample, roof: number, top: number): Vec3 {
  const open = INSIDE + (OUTSIDE - INSIDE) * smooth((y - roof) / FLARE);
  const radius = (TIP + (open - TIP) * smooth((top - y) / SPIRE_HEIGHT)) * (1 + spread);
  const turn = (2 * Math.PI * y) / PITCH + phase;
  return [radius * Math.cos(turn), y, radius * Math.sin(turn)];
}

function branchNames(refs: readonly string[]): string[] {
  return refs
    .filter((r) => !r.startsWith('tag:'))
    .map((r) => r.replace(/^HEAD -> /, ''))
    .filter((r) => r !== 'HEAD' && !r.endsWith('/HEAD'));
}

const isDefault = (name: string) => /^(origin\/)?(main|master)$/.test(name);

function claimStrands(list: readonly StalkCommit[]): Map<string, number> {
  const bySha = new Map(list.map((c) => [c.sha, c]));
  const owner = new Map<string, number>();
  let count = 0;
  const claim = (tip: string) => {
    if (owner.has(tip)) return;
    const id = count++;
    let next: string | undefined = tip;
    while (next && !owner.has(next)) {
      const commit = bySha.get(next);
      if (!commit) break;
      owner.set(next, id);
      next = commit.parents[0];
    }
  };
  claim((list.find((c) => branchNames(c.refs).some(isDefault)) ?? itemAt(list, 0)).sha);
  for (const c of list) claim(c.sha);
  return owner;
}

function heights(oldestFirst: readonly StalkCommit[], now: number, lo: number, hi: number) {
  let total = 0;
  const rise = oldestFirst.map((c, i) =>
    i === 0 ? 0 : (total += 1 + BOOST * clamp(1 - (now - c.at) / (RECENT_DAYS * DAY), 0, 1)),
  );
  return rise.map((r) => (total > 0 ? lo + ((hi - lo) * r) / total : lo));
}

const centerline = (chain: readonly Sample[]): Sample[] =>
  chain.flatMap((s, i) => {
    const next = chain[i + 1];
    if (!next) return [s];
    const parts = Math.max(1, Math.ceil((next.y - s.y) / STEP));
    return Array.from({ length: parts }, (_, j) => (j ? lerp(s, next, j / parts) : s));
  });

type Plan = {
  bySha: Map<string, StalkCommit>;
  owner: Map<string, number>;
  level: Map<string, number>;
  members: string[][];
  strandCount: number;
};

const targetOf = (k: number, strandCount: number): Sample => ({
  y: 0,
  phase: (2 * Math.PI * k) / strandCount,
  spread: k === 0 ? 0 : (k % 2 ? 1 : -1) * (0.1 + 0.04 * (k % 3)),
});

function anchorOf({ bySha, owner, members }: Plan, k: number): string | undefined {
  const parent = valueOf(bySha, itemAt(itemAt(members, k), 0)).parents[0];
  return parent !== undefined && owner.get(parent) !== k ? parent : undefined;
}

function placeCommits(plan: Plan): Map<string, Sample> {
  const { level, members, strandCount } = plan;
  const samples = new Map<string, Sample>();
  const order = members
    .map((_, k) => k)
    .sort(
      (a, b) =>
        valueOf(level, itemAt(itemAt(members, a), 0)) -
        valueOf(level, itemAt(itemAt(members, b), 0)),
    );
  for (const k of order) {
    const anchor = anchorOf(plan, k);
    const from = anchor === undefined ? undefined : samples.get(anchor);
    const end = from ? nearest(from, targetOf(k, strandCount)) : targetOf(k, strandCount);
    for (const sha of itemAt(members, k)) {
      const y = valueOf(level, sha);
      samples.set(
        sha,
        from ? { ...lerp(from, end, smooth((y - from.y) / FORK_RAMP)), y } : { ...end, y },
      );
    }
  }
  return samples;
}

function swingMerged(
  { owner, members }: Plan,
  oldestFirst: readonly StalkCommit[],
  samples: Map<string, Sample>,
): Map<number, string> {
  const merged = new Map<number, string>();
  for (const c of oldestFirst)
    for (const p of c.parents) {
      const k = owner.get(p);
      if (k && k < MAX_STRANDS && owner.get(c.sha) !== k && itemAt(members, k).at(-1) === p)
        if (samples.has(c.sha) && !merged.has(k)) merged.set(k, c.sha);
    }
  const first = new Map(samples);
  for (const [k, into] of merged) {
    const end = valueOf(first, into);
    for (const sha of itemAt(members, k)) {
      const s = valueOf(first, sha);
      const toward = nearest(s, end);
      samples.set(sha, { ...lerp(s, toward, smooth(1 - (end.y - s.y) / FORK_RAMP)), y: s.y });
    }
  }
  return merged;
}

type Geometry = { roof: number; top: number };

function strandsOf(
  plan: Plan,
  samples: ReadonlyMap<string, Sample>,
  merged: ReadonlyMap<number, string>,
  recent: readonly StalkCommit[],
  { roof, top }: Geometry,
): { strands: Strand[]; energy: number } {
  const { bySha, owner, members, strandCount } = plan;
  const energy = clamp(recent.length / 60, 0, 1);
  const active = new Set(recent.map((c) => valueOf(owner, c.sha)).filter((k) => k < MAX_STRANDS));
  const thickness = clamp(0.14 + 0.1 * energy + 0.015 * active.size, 0.14, 0.26);
  const strands = members.map((shas, k): Strand => {
    const anchor = anchorOf(plan, k);
    const into = merged.get(k);
    const chain = [anchor, ...shas, into]
      .filter((sha): sha is string => sha !== undefined && samples.has(sha))
      .map((sha) => valueOf(samples, sha));
    const trunk = targetOf(0, strandCount);
    const path = k === 0 ? [{ ...trunk, y: BASE_Y }, ...chain, { ...trunk, y: top }] : chain;
    const name = branchNames(valueOf(bySha, lastOf(shas)).refs);
    return {
      name: name.find((n) => !n.startsWith('origin/')) ?? name[0] ?? '',
      color: paletteAt(k),
      radius: k === 0 ? thickness : thickness * 0.7,
      free: [k === 0 || !(anchor && samples.has(anchor)), k === 0 || into === undefined],
      points: centerline(path).map((s) => braid(s, roof, top)),
    };
  });
  return { strands, energy };
}

export function layoutStalk(
  commits: readonly StalkCommit[],
  now: number,
  roof: number,
): Stalk | null {
  if (!commits.length) return null;
  const oldestFirst = [...commits].reverse();
  const owner = claimStrands(commits);
  const strandCount = Math.min(MAX_STRANDS, new Set(owner.values()).size);
  const tiers = layoutTiers(oldestFirst, owner, roof, strandCount);
  const top = crownTop(roof, tiers.length);
  const rise = heights(oldestFirst, now, FIRST_COMMIT_Y, top - 1.5);
  const level = new Map(oldestFirst.map((c, i) => [c.sha, itemAt(rise, i)]));
  const kept = oldestFirst.filter((c) => valueOf(owner, c.sha) < MAX_STRANDS);
  const members: string[][] = Array.from({ length: strandCount }, () => []);
  for (const c of kept) itemAt(members, valueOf(owner, c.sha)).push(c.sha);
  const plan: Plan = {
    bySha: new Map(commits.map((c) => [c.sha, c])),
    owner,
    level,
    members,
    strandCount,
  };
  const samples = placeCommits(plan);
  const merged = swingMerged(plan, oldestFirst, samples);
  const recent = commits.filter((c) => now - c.at <= RECENT_DAYS * DAY);
  const { strands, energy } = strandsOf(plan, samples, merged, recent, { roof, top });
  const nodes = kept
    .map((c): StalkNode => ({
      sha: c.sha,
      subject: c.subject,
      author: c.author,
      at: c.at,
      refs: branchNames(c.refs),
      strand: valueOf(owner, c.sha),
      merge: c.parents.length > 1,
      position: braid(valueOf(samples, c.sha), roof, top),
    }))
    .reverse();
  return { nodes, strands, tiers, roof, top, energy };
}

type Exploding = { floorHeight: number; gap: number };
const SLAB_BELOW = 1.2;
const JOIN = 0.2;

const seams = (roof: number, { floorHeight }: Exploding) =>
  Array.from(
    { length: Math.round(roof / floorHeight) - 1 },
    (_, i) => (i + 1) * floorHeight - SLAB_BELOW,
  );

export function spread(y: number, roof: number, exploding: Exploding): number {
  return seams(roof, exploding).reduce(
    (shift, seam) => shift + exploding.gap * clamp((y - seam) / JOIN, 0, 1),
    y,
  );
}

export function spreadStalk(stalk: Stalk, exploding: Exploding): Stalk {
  const { roof } = stalk;
  const cuts = seams(roof, exploding).flatMap((seam) => [seam, seam + JOIN]);
  const move = ([x, y, z]: Vec3): Vec3 => [x, spread(y, roof, exploding), z];
  const stretch = (points: Vec3[]): Vec3[] =>
    points.flatMap((p, i) => {
      const next = points[i + 1];
      if (!next) return [move(p)];
      const between = cuts.filter((y) => y > p[1] && y < next[1]);
      return [
        move(p),
        ...between.map((y): Vec3 => {
          const t = (y - p[1]) / (next[1] - p[1]);
          return move([p[0] + (next[0] - p[0]) * t, y, p[2] + (next[2] - p[2]) * t]);
        }),
      ];
    });
  return {
    ...stalk,
    roof: spread(roof, roof, exploding),
    top: spread(stalk.top, roof, exploding),
    nodes: stalk.nodes.map((n) => ({ ...n, position: move(n.position) })),
    strands: stalk.strands.map((s) => ({ ...s, points: stretch(s.points) })),
    tiers: stalk.tiers.map((t) => ({ ...t, y: spread(t.y, roof, exploding) })),
  };
}
