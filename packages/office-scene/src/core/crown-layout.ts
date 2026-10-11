import type { StalkCommit, Tier, TierShape } from './stalk-types.js';
import { itemAt } from '../environment/checked.js';

export const COMMITS_PER_TIER = 12;
export const MAX_TIERS = 12;
const CROWN_GAP = 6;
export const TIER_HEIGHT = 3.4;
export const SPIRE_HEIGHT = 14;

export const crownTop = (roof: number, tiers: number) =>
  roof + CROWN_GAP + tiers * TIER_HEIGHT + SPIRE_HEIGHT;
const tierRadius = (index: number) => Math.max(7.5, 20 - 1.1 * index);
const runSize = (commits: number) => Math.max(COMMITS_PER_TIER, Math.ceil(commits / MAX_TIERS));
export const tierCount = (commits: number) => Math.ceil(commits / runSize(commits));

function shapeOf(
  index: number,
  stats: { merges: number; authors: number; branches: number },
): TierShape {
  if (stats.merges >= 2) return 'garden';
  if (stats.authors >= 3) return 'cluster';
  if (stats.branches >= 3) return 'halo';
  return index % 2 ? 'prism' : 'terrace';
}

export function layoutTiers(
  oldestFirst: readonly StalkCommit[],
  owner: ReadonlyMap<string, number>,
  roof: number,
  strands: number,
): Tier[] {
  const count = tierCount(oldestFirst.length);
  const size = runSize(oldestFirst.length);
  return Array.from({ length: count }, (_, index): Tier => {
    const run = oldestFirst.slice(index * size, (index + 1) * size);
    const strandOf = run.flatMap((c) => {
      const k = owner.get(c.sha);
      return k !== undefined && k < strands ? [k] : [];
    });
    const counts = new Map<number, number>();
    for (const k of strandOf) counts.set(k, (counts.get(k) ?? 0) + 1);
    const stats = {
      merges: run.filter((c) => c.parents.length > 1).length,
      authors: new Set(run.map((c) => c.author)).size,
      branches: counts.size,
    };
    const dominant = [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? 0;
    return {
      index,
      shape: shapeOf(index, stats),
      y: roof + CROWN_GAP + index * TIER_HEIGHT,
      radius: tierRadius(index),
      from: Math.min(...run.map((c) => c.at)),
      to: Math.max(...run.map((c) => c.at)),
      commits: run.length,
      ...stats,
      strand: dominant,
      seed: itemAt(run, 0).sha,
    };
  });
}
