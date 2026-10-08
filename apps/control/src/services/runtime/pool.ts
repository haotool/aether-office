/**
 * Runs `work` over `items` with at most `width` in flight, keeping results in input order. Unlike batches, one slow
 * item does not hold up the others; unlike Promise.all over everything, it bounds the buffers and processes alive.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  width: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const pending = items.entries(); // one iterator shared by the workers: each takes the next item
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(width, items.length)) }, async () => {
      for (const [i, item] of pending) results[i] = await work(item, i);
    }),
  );
  return results;
}
