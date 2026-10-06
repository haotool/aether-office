import { describe, expect, it } from 'vitest';
import {
  ARCHETYPES,
  MAX_PETALS,
  MIN_SPREAD,
  SHAPE_KEYS,
  SHAPE_RANGE,
  genomeOf,
  spreadOf,
} from '../../packages/office-scene/src/flower-genome.js';
import { MAX_MERGE_FLOWERS } from '../../packages/office-scene/src/merge-flowers.js';
import { speciesName } from '../../packages/office-scene/src/flower-names.js';
import { gardenOf } from '../../packages/office-scene/src/garden-geometry.js';
import { layoutStalk, type StalkCommit } from '../../packages/office-scene/src/stalk-layout.js';

const NOW = 1_800_000_000_000;
const input = (seed: string, extra = {}) => ({
  seed,
  merges: 0,
  authors: 1,
  branches: 1,
  ...extra,
});
const seeds = Array.from({ length: 400 }, (_, i) => `sha${i * 7919}`);

describe('genome', () => {
  it('is deterministic and varies with the seed', () => {
    expect(genomeOf(input('abc'))).toEqual(genomeOf(input('abc')));
    expect(new Set(seeds.map((s) => genomeOf(input(s)).code)).size).toBeGreaterThan(380);
    expect(new Set(seeds.map((s) => genomeOf(input(s)).archetype)).size).toBe(ARCHETYPES.length);
    expect(genomeOf(input('abc')).shape).not.toEqual(genomeOf(input('abd')).shape);
  });

  it('keeps every parameter in its range and the weights summing to one', () => {
    for (const s of seeds) {
      const g = genomeOf(input(s, { merges: 3, authors: 4, branches: 4 }));
      for (const k of SHAPE_KEYS) {
        expect(g.shape[k]).toBeGreaterThanOrEqual(SHAPE_RANGE[k][0]);
        expect(g.shape[k]).toBeLessThanOrEqual(SHAPE_RANGE[k][1]);
      }
      expect(g.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      expect([3, 5, 8, 13, 21]).toContain(g.petals);
      expect(g.petals * g.whorls).toBeLessThanOrEqual(MAX_PETALS);
    }
  });

  it('uses Fibonacci floret counts and opens the great bloom wide', () => {
    for (const s of seeds) {
      expect([13, 21, 34, 55, 89]).toContain(genomeOf(input(s)).florets);
      const grand = genomeOf(input(s, { grand: true }));
      expect(grand.shape.pitch).toBeGreaterThanOrEqual(0.85);
      expect(grand.halo).toBeGreaterThan(0);
      // Richer than any other flower: five whorls, a full disc, a crown of stamens and a cloud of motes.
      expect(grand.whorls).toBe(5);
      expect([13, 21]).toContain(grand.petals);
      expect(grand.florets).toBe(89);
      expect(grand.filaments).toBe(34);
      expect(grand.pollen).toBeGreaterThanOrEqual(64);
    }
  });

  it('never grows a closed bud: every archetype spreads its petals above the floor', () => {
    const lowest = new Map<string, number>();
    for (const s of Array.from({ length: 4000 }, (_, i) => `floor${i * 104729}`)) {
      const g = genomeOf(input(s, { merges: s.length % 3, authors: 1 + (s.length % 4) }));
      const spread = spreadOf(g.shape);
      expect(spread).toBeGreaterThanOrEqual(MIN_SPREAD);
      lowest.set(g.archetype, Math.min(spread, lowest.get(g.archetype) ?? Infinity));
    }
    expect([...lowest.keys()].sort()).toEqual([...ARCHETYPES].sort());
  });

  it('names a species in both languages', () => {
    const g = genomeOf(input('abc'));
    expect(speciesName(g.archetype, g.epithet, true)).toMatch(/^[A-Za-z-]+ [A-Za-z]+$/);
    expect(speciesName(g.archetype, g.epithet, false)).toMatch(/[一-鿿]/);
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
      at: NOW - i * 3_600_000,
    };
  });
}

describe('garden', () => {
  const stalk = layoutStalk(history(150, 'h'), NOW, 42)!;

  it('is deterministic', () => {
    const a = gardenOf(stalk, false)!;
    const b = gardenOf(stalk, false)!;
    expect(a.triangles).toBe(b.triangles);
    expect(Array.from(a.mesh.getAttribute('position').array)).toEqual(
      Array.from(b.mesh.getAttribute('position').array),
    );
  });

  it('stays inside the triangle budget and thins on low quality', () => {
    const high = gardenOf(stalk, false)!;
    const low = gardenOf(stalk, true)!;
    expect(stalk.tiers).toHaveLength(12);
    expect(high.blooms).toHaveLength(13 + MAX_MERGE_FLOWERS);
    expect(low.blooms).toHaveLength(13);
    expect(high.triangles).toBeLessThanOrEqual(30_000);
    expect(low.triangles).toBeLessThan(high.triangles * 0.6);
    expect(low.pollen).toBeNull();
    expect(high.pollen).not.toBeNull();
  });

  it('is nothing without tiers', () => {
    expect(gardenOf({ ...stalk, tiers: [] }, false)).toBeNull();
  });

  it('stays bounded for many histories', () => {
    for (let i = 0; i < 20; i++) {
      const s = layoutStalk(history(150, `x${i}`), NOW, 42)!;
      expect(gardenOf(s, false)!.triangles).toBeLessThanOrEqual(28_000);
    }
  });
});
