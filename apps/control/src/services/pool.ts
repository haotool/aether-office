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
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(width, items.length)) }, async () => {
      while (next < items.length) {
        const i = next++;
        results[i] = await work(items[i]!, i);
      }
    }),
  );
  return results;
}
