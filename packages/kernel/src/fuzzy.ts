/**
 * Pure. How well `query` matches `text` as a fuzzy (in-order, not necessarily adjacent) match, or null when it does not
 * match at all. Higher is better: a prefix beats a word start beats a run of adjacent letters beats scattered ones, and a
 * shorter text beats a longer one with the same match. Case is ignored.
 */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase();
  const s = text.toLowerCase();
  if (!q) return 0;
  let score = 0;
  let from = 0;
  let previous = -2;
  for (const ch of q) {
    const at = s.indexOf(ch, from);
    if (at < 0) return null;
    const boundary = at === 0 || /[^a-z0-9]/.test(s.charAt(at - 1));
    score += 1 + (at === previous + 1 ? 4 : 0) + (boundary ? 3 : 0) + (at === 0 ? 4 : 0);
    previous = at;
    from = at + 1;
  }
  return score - s.length / 100;
}

/** Pure. The items that match `query`, best first, at most `limit`; with an empty query, the first `limit` in order. */
export function fuzzyRank<T>(
  query: string,
  items: readonly T[],
  textOf: (item: T) => string,
  limit: number,
): T[] {
  if (!query) return items.slice(0, limit);
  return items
    .flatMap((item, index) => {
      const score = fuzzyScore(query, textOf(item));
      return score === null ? [] : [{ item, score, index }];
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, limit)
    .map((m) => m.item);
}
