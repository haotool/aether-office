import { describe, expect, it } from 'vitest';
import {
  COMMITS_PER_TIER,
  MAX_TIERS,
  SPIRE_HEIGHT,
  TIER_HEIGHT,
  tierCount,
} from '../../packages/office-scene/src/core/crown-layout.js';
import {
  CORE_RADIUS,
  MAX_BRAID_RADIUS,
  MAX_STRANDS,
  layoutStalk,
  spread,
  spreadStalk,
  type StalkCommit,
} from '../../packages/office-scene/src/core/stalk-layout.js';

const DAY = 86_400_000;
const NOW = 1_800_000_000_000;
const ROOF = 42;
const EXPLODING = { floorHeight: 7, gap: 11 };

function line(n: number, gapDays: number, ageDays = 0, prefix = 'c'): StalkCommit[] {
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    return {
      sha: `${prefix}${String(k).padStart(5, '0')}`,
      parents: k > 0 ? [`${prefix}${String(k - 1).padStart(5, '0')}`] : [],
      refs: k === n - 1 ? ['HEAD -> main'] : [],
      subject: `commit ${k}`,
      author: 'ada',
      at: NOW - (ageDays + i * gapDays) * DAY,
    };
  });
}

function forked(): StalkCommit[] {
  const c = (sha: string, parents: string[], age: number, refs: string[] = []): StalkCommit => ({
    sha,
    parents,
    refs,
    subject: sha,
    author: 'ada',
    at: NOW - age * DAY,
  });
  return [
    c('m5', ['m4', 'f2'], 0, ['HEAD -> main', 'origin/main']),
    c('m4', ['m3'], 1),
    c('f2', ['f1'], 2, ['feature/x']),
    c('m3', ['m2'], 3),
    c('f1', ['m2'], 4),
    c('m2', ['m1'], 5),
    c('m1', ['m0'], 6),
    c('m0', [], 7),
  ];
}

const radius = ([x, , z]: number[]) => Math.hypot(x!, z!);

describe('layoutStalk', () => {
  it('is empty without commits and deterministic with them', () => {
    expect(layoutStalk([], NOW, ROOF)).toBeNull();
    expect(layoutStalk(forked(), NOW, ROOF)).toEqual(layoutStalk(forked(), NOW, ROOF));
  });

  it('puts the default branch on strand 0 and forks on their own strand', () => {
    const stalk = layoutStalk(forked(), NOW, ROOF)!;
    const strandOf = (sha: string) => stalk.nodes.find((n) => n.sha === sha)!.strand;
    expect(stalk.strands).toHaveLength(2);
    expect(['m0', 'm1', 'm2', 'm3', 'm4', 'm5'].map(strandOf)).toEqual([0, 0, 0, 0, 0, 0]);
    expect(strandOf('f1')).toBe(1);
    expect(strandOf('f2')).toBe(1);
    expect(stalk.strands[1]!.name).toBe('feature/x');
    expect(stalk.nodes.find((n) => n.sha === 'm5')!.merge).toBe(true);
  });

  it('starts a fork at its parent commit and ends a merged branch at the merge commit', () => {
    const stalk = layoutStalk(forked(), NOW, ROOF)!;
    const at = (sha: string) => stalk.nodes.find((n) => n.sha === sha)!.position;
    const side = stalk.strands[1]!.points;
    expect(side[0]).toEqual(at('m2'));
    expect(side[side.length - 1]).toEqual(at('m5'));
    expect(at('f1')[1]).toBeGreaterThan(at('m2')[1]);
    expect(stalk.strands[1]!.free).toEqual([false, false]);
    expect(stalk.strands[0]!.free).toEqual([true, true]);
  });

  it('grows upward with history: a parent is always below its child, and strands rise monotonically', () => {
    const stalk = layoutStalk(forked(), NOW, ROOF)!;
    const y = (sha: string) => stalk.nodes.find((n) => n.sha === sha)!.position[1];
    for (const c of forked()) for (const p of c.parents) expect(y(p)).toBeLessThan(y(c.sha));
    for (const s of stalk.strands)
      s.points.slice(1).forEach((p, i) => expect(p[1]).toBeGreaterThan(s.points[i]![1]));
  });

  it('keeps every strand on the central axis: inside the elevator core below the roof, within the crown above', () => {
    const stalks = [layoutStalk(line(120, 0.2), NOW, ROOF)!, layoutStalk(forked(), NOW, ROOF)!];
    for (const stalk of stalks)
      for (const s of stalk.strands)
        for (const p of s.points) {
          expect(radius(p)).toBeLessThanOrEqual(MAX_BRAID_RADIUS);
          if (p[1] <= ROOF) expect(radius(p) + s.radius).toBeLessThan(CORE_RADIUS);
        }
  });

  it('runs the trunk from inside the lowest floor to the tip of the spire', () => {
    const stalk = layoutStalk(line(40, 1), NOW, ROOF)!;
    const trunk = stalk.strands[0]!.points;
    expect(trunk[0]![1]).toBeLessThan(0);
    expect(trunk[trunk.length - 1]![1]).toBe(stalk.top);
    expect(stalk.top).toBe(ROOF + 6 + stalk.tiers.length * TIER_HEIGHT + SPIRE_HEIGHT);
    const ys = stalk.nodes.map((n) => n.position[1]);
    expect(Math.max(...ys)).toBeLessThan(stalk.top);
    expect(Math.min(...ys)).toBeGreaterThan(0);
  });

  it('gives a recent commit more room than an old one, and thickness and energy follow the last two weeks', () => {
    const gaps = (commits: StalkCommit[]) => {
      const stalk = layoutStalk(commits, NOW, ROOF)!;
      const y = stalk.nodes.map((n) => n.position[1]);
      return { newest: y[0]! - y[1]!, oldest: y[y.length - 2]! - y[y.length - 1]! };
    };
    const history = line(40, 0.2).map((c, i) => ({
      ...c,
      at: NOW - (i < 20 ? i * 0.2 : 60 + i * 30) * DAY,
    }));
    const mixed = gaps(history);
    expect(mixed.newest).toBeGreaterThan(mixed.oldest);
    const busy = layoutStalk(line(400, 0.01), NOW, ROOF)!;
    const quiet = layoutStalk(line(5, 90, 400), NOW, ROOF)!;
    expect(busy.energy).toBe(1);
    expect(quiet.energy).toBe(0);
    expect(busy.strands[0]!.radius).toBeLessThanOrEqual(0.26);
    expect(quiet.strands[0]!.radius).toBeGreaterThan(0.1);
    expect(busy.strands[0]!.radius).toBeGreaterThan(quiet.strands[0]!.radius);
  });

  it('survives a window that cuts off parents and caps the number of strands', () => {
    const cut = layoutStalk(line(10, 1).slice(0, 5), NOW, ROOF)!;
    expect(cut.nodes).toHaveLength(5);
    const many: StalkCommit[] = Array.from({ length: 30 }, (_, i) => ({
      sha: `t${i}`.padEnd(8, '0'),
      parents: [],
      refs: [`b${i}`],
      subject: 'x',
      author: 'a',
      at: NOW - i * DAY,
    }));
    expect(layoutStalk(many, NOW, ROOF)!.strands.length).toBeLessThanOrEqual(MAX_STRANDS);
  });
});

describe('the crown', () => {
  it('adds a tier per run of commits and never loses one as history grows', () => {
    let last = 0;
    for (let n = 1; n <= 400; n += 7) {
      const tiers = layoutStalk(line(n, 0.2), NOW, ROOF)!.tiers;
      expect(tiers).toHaveLength(tierCount(n));
      expect(tiers.length).toBeGreaterThanOrEqual(last);
      expect(tiers.length).toBeLessThanOrEqual(MAX_TIERS);
      last = tiers.length;
    }
    expect(layoutStalk(line(COMMITS_PER_TIER, 1), NOW, ROOF)!.tiers).toHaveLength(1);
    expect(layoutStalk(line(COMMITS_PER_TIER + 1, 1), NOW, ROOF)!.tiers).toHaveLength(2);
    expect(layoutStalk(line(150, 1), NOW, ROOF)!.tiers).toHaveLength(MAX_TIERS);
  });

  it('stacks the tiers from the roof, each smaller than the one below, covering every commit once', () => {
    const stalk = layoutStalk(line(100, 1), NOW, ROOF)!;
    stalk.tiers.forEach((t, i) => {
      expect(t.index).toBe(i);
      expect(t.y).toBeGreaterThan(i ? stalk.tiers[i - 1]!.y : ROOF);
      if (i) expect(t.radius).toBeLessThanOrEqual(stalk.tiers[i - 1]!.radius);
      if (i) expect(t.from).toBeGreaterThanOrEqual(stalk.tiers[i - 1]!.to);
    });
    expect(stalk.tiers.reduce((sum, t) => sum + t.commits, 0)).toBe(100);
  });

  it('shapes a tier from what happened in it, and by position otherwise', () => {
    const shapes = (commits: StalkCommit[]) =>
      layoutStalk(commits, NOW, ROOF)!.tiers.map((t) => t.shape);
    expect(shapes(line(COMMITS_PER_TIER * 2, 1))).toEqual(['terrace', 'prism']);
    const merges = line(COMMITS_PER_TIER, 1).map((c, i) =>
      i % 3 === 0 ? { ...c, parents: [...c.parents, 'x'] } : c,
    );
    expect(shapes(merges)).toEqual(['garden']);
    const hands = line(COMMITS_PER_TIER, 1).map((c, i) => ({ ...c, author: `a${i % 4}` }));
    expect(shapes(hands)).toEqual(['cluster']);
  });

  it('summarises a tier with its dates, commits, merges and authors', () => {
    const [tier] = layoutStalk(forked(), NOW, ROOF)!.tiers;
    expect(tier).toMatchObject({ commits: 8, merges: 1, authors: 1, branches: 2 });
    expect(tier!.from).toBe(NOW - 7 * DAY);
    expect(tier!.to).toBe(NOW);
  });
});

describe('spreadStalk', () => {
  it('moves each floor with its own slab and stretches the braid across every gap', () => {
    const stalk = layoutStalk(line(60, 0.5), NOW, ROOF)!;
    const apart = spreadStalk(stalk, EXPLODING);
    expect(spread(0, ROOF, EXPLODING)).toBe(0);
    expect(spread(7 * 3 + 2, ROOF, EXPLODING)).toBe(7 * 3 + 2 + 3 * 11);
    expect(apart.top - stalk.top).toBe(5 * 11);
    expect(apart.tiers[0]!.y - stalk.tiers[0]!.y).toBe(5 * 11);
    const trunk = apart.strands[0]!.points;
    trunk.slice(1).forEach((p, i) => expect(p[1]).toBeGreaterThan(trunk[i]![1]));
    const inside = trunk.filter((p) => p[1] >= 2 * 18 && p[1] <= 2 * 18 + 6);
    expect(inside.length).toBeGreaterThan(10);
    expect(Math.max(...trunk.slice(1).map((p, i) => p[1] - trunk[i]![1]))).toBeGreaterThan(10);
    for (const p of trunk) expect(radius(p)).toBeLessThanOrEqual(MAX_BRAID_RADIUS);
  });
});
