/**
 * At most `width` in flight, results in input order: unlike batches one slow item holds nobody up, unlike Promise.all
 * over everything it bounds buffers and live processes.
 */
export async function mapPool<T, R>(
  items: readonly T[],
  width: number,
  work: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const pending = items.entries();
  await Promise.all(
    Array.from({ length: Math.max(1, Math.min(width, items.length)) }, async () => {
      for (const [i, item] of pending) results[i] = await work(item, i);
    }),
  );
  return results;
}
