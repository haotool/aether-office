/** A memo over a Map that keeps at most `limit` entries (the oldest goes first): for pure per-seed caches whose key space grows with the sessions seen. */
export function memoized<K, V>(
  cache: Map<K, V>,
  limit: number,
  make: (key: K) => V,
): (key: K) => V {
  return (key) => {
    const hit = cache.get(key);
    if (hit !== undefined) return hit;
    const made = make(key);
    if (cache.size >= limit) cache.delete(cache.keys().next().value as K);
    cache.set(key, made);
    return made;
  };
}

/** Most members a pure per-seed memo remembers; beyond it the oldest is recomputed on demand. */
export const MEMO_LIMIT = 512;
