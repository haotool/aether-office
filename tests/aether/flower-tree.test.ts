import { describe, expect, it } from 'vitest';
import {
  MAX_BUDS,
  MAX_TWIG_SEGMENTS,
  colonize,
  twigShare,
  type ColonyParams,
} from '../../packages/office-scene/src/flower-tree.js';
import { gardenOf } from '../../packages/office-scene/src/garden-geometry.js';
import { layoutStalk, type StalkCommit } from '../../packages/office-scene/src/stalk-layout.js';

const centre: [number, number, number] = [10, 40, -4];
const distance = (a: number[], b: number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const params = (seed: string, extra: Partial<ColonyParams> = {}): ColonyParams => ({
  seed,
  roots: [1, 2, 3, 4].map((i): [number, number, number] => [10, 40 + i * 0.6, -4]),
  envelope: {
    centre,
    radius: 6,
    avoid: [12, 47, -4],
    avoidRadius: 3,
  },
  attractors: 40,
  step: 1.2,
  influence: 6,
  kill: 1.5,
  maxSegments: 300,
  ...extra,
});
const positions = (seed: string, extra?: Partial<ColonyParams>) =>
  colonize(params(seed, extra)).nodes;

describe('space colonization', () => {
  it('is deterministic and differs with the seed', () => {
    expect(positions('a')).toEqual(positions('a'));
    expect(positions('a')).not.toEqual(positions('b'));
  });

  it('stays in the envelope above the deck, with no NaN', () => {
    for (let i = 0; i < 60; i++) {
      const p = params(`bounds${i}`);
      const { nodes, roots } = colonize(p);
      for (const n of nodes.slice(roots)) {
        expect(n.every(Number.isFinite)).toBe(true);
        expect(distance(n, centre)).toBeLessThanOrEqual(p.envelope.radius + 2 * p.step);
        expect(n[1]).toBeGreaterThanOrEqual(centre[1] - p.step);
      }
    }
  });

  it('grows connected branches that reach most attractors', () => {
    let reached = 0;
    let total = 0;
    for (let i = 0; i < 40; i++) {
      const c = colonize(params(`reach${i}`));
      c.parent.forEach((p, k) => expect(p).toBeLessThan(k));
      c.parent.slice(c.roots).forEach((p) => expect(p).toBeGreaterThanOrEqual(0));
      reached += c.reached;
      total += c.attractors;
    }
    expect(reached / total).toBeGreaterThan(0.7);
  });

  it('never grows more segments than it may', () => {
    const c = colonize(params('cap', { maxSegments: 9 }));
    expect(c.nodes.length - c.roots).toBe(9);
    expect(colonize(params('none', { maxSegments: 0 })).nodes).toHaveLength(4);
  });
});

function history(n: number, prefix: string): StalkCommit[] {
  const sha = (k: number) => `${prefix}${String(k * 31 + 7).padStart(6, '0')}`;
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    return {
      sha: sha(k),
      parents: k > 0 ? [sha(k - 1), ...(k % 5 === 0 && k > 6 ? [sha(k - 6)] : [])] : [],
      refs: k === n - 1 ? ['main'] : [],
      subject: 's',
      author: `a${k % 4}`,
      at: 1_800_000_000_000 - i * 3_600_000,
    };
  });
}

describe('glass trees in the garden', () => {
  it('share the segment and bud limits between the trees', () => {
    for (const trees of [1, 3, 12]) {
      const share = twigShare(trees);
      expect(share.segments * trees).toBeLessThanOrEqual(MAX_TWIG_SEGMENTS);
      expect(share.buds * trees).toBeLessThanOrEqual(MAX_BUDS);
    }
  });

  it('stay inside the garden-wide limits whatever the history', () => {
    for (const [n, prefix] of [
      [30, 'p'],
      [100, 'q'],
      [150, 'r'],
    ] as const) {
      const stalk = layoutStalk(history(n, prefix), 1_800_000_000_000, 42)!;
      for (const low of [false, true]) {
        const { twigs } = gardenOf(stalk, low)!;
        expect(twigs.segments).toBeGreaterThan(0);
        expect(twigs.segments).toBeLessThanOrEqual(MAX_TWIG_SEGMENTS);
        expect(twigs.buds).toBeLessThanOrEqual(MAX_BUDS);
      }
    }
  });
});
