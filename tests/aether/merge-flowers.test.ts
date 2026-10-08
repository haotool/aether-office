import { describe, expect, it } from 'vitest';
import { gardenOf } from '../../packages/office-scene/src/core/garden-geometry.js';
import {
  MAX_MERGE_FLOWERS,
  mergeStands,
} from '../../packages/office-scene/src/core/merge-flowers.js';
import { MAX_FLOWERS } from '../../packages/office-scene/src/core/garden-material.js';
import {
  layoutStalk,
  type StalkCommit,
} from '../../packages/office-scene/src/core/stalk-layout.js';

const NOW = 1_800_000_000_000;
/** A linear history with a second parent (a merge) on every `every`th commit. */
function history(n: number, prefix: string, every: number): StalkCommit[] {
  const sha = (k: number) => `${prefix}${String(k * 31 + 7).padStart(6, '0')}`;
  return Array.from({ length: n }, (_, i) => {
    const k = n - 1 - i;
    return {
      sha: sha(k),
      parents: k > 0 ? [sha(k - 1), ...(k % every === 0 && k > 6 ? [sha(k - 6)] : [])] : [],
      refs: k === n - 1 ? ['main'] : [],
      subject: `subject ${k}`,
      author: `a${k % 4}`,
      at: NOW - i * 3_600_000,
    };
  });
}

describe('merge flowers', () => {
  const stalk = layoutStalk(history(150, 'm', 5), NOW, 42)!;
  const merges = stalk.nodes.filter((n) => n.merge);

  it('are the newest merges, at most sixteen, each with its own shader index', () => {
    expect(merges.length).toBeGreaterThan(MAX_MERGE_FLOWERS);
    const stands = mergeStands(stalk, 13);
    expect(stands).toHaveLength(MAX_MERGE_FLOWERS);
    expect(stands.map((s) => s.node.sha)).toEqual(
      merges.slice(0, MAX_MERGE_FLOWERS).map((n) => n.sha),
    );
    expect(stands.map((s) => s.bloom.flower)).toEqual(
      Array.from({ length: MAX_MERGE_FLOWERS }, (_, i) => 13 + i),
    );
    expect(13 + MAX_MERGE_FLOWERS).toBeLessThanOrEqual(MAX_FLOWERS);
  });

  it('are small, plain, deterministic and stand at their commit', () => {
    const a = mergeStands(stalk, 13);
    expect(a.map((s) => s.bloom.genome.code)).toEqual(
      mergeStands(stalk, 13).map((s) => s.bloom.genome.code),
    );
    for (const { bloom, node } of a) {
      expect(bloom.size).toBeLessThan(1);
      expect(bloom.genome.whorls).toBe(1);
      expect(bloom.genome.petals).toBeLessThanOrEqual(13);
      expect(bloom.genome.halo).toBe(0);
      expect(bloom.origin.y).toBe(node.position[1]);
      expect(Math.hypot(bloom.origin.x, bloom.origin.z)).toBeLessThanOrEqual(1.1 + 1e-9);
    }
  });

  it('are none without a merge', () => {
    expect(mergeStands(layoutStalk(history(40, 'n', 1000), NOW, 42)!, 4)).toEqual([]);
  });

  it('join the garden mesh: named by commit, none on low quality, a bounded cost', () => {
    const high = gardenOf(stalk, false)!;
    const low = gardenOf(stalk, true)!;
    const without = gardenOf(
      { ...stalk, nodes: stalk.nodes.map((n) => ({ ...n, merge: false })) },
      false,
    )!;
    expect(high.blooms).toHaveLength(13 + MAX_MERGE_FLOWERS);
    expect(high.blooms[13]!.merge!.subject).toBe(merges[0]!.subject);
    expect(high.blooms[13]!.sha).toBe(merges[0]!.sha);
    expect(high.climb.slice(0, 13).every((c) => c === null)).toBe(true);
    expect(high.climb[13]).toBe(merges[0]!.position[1]);
    expect(low.blooms).toHaveLength(13);
    expect(without.blooms).toHaveLength(13);
    expect(high.triangles - without.triangles).toBeLessThanOrEqual(MAX_MERGE_FLOWERS * 400);
  });
});
