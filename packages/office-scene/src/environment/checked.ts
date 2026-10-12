// The index or key is already proven by the caller (a modulo, a clamp, a non-empty check); a broken invariant throws
// here instead of surfacing as NaN or "undefined is not an object" much later.

export function itemAt<T>(list: ArrayLike<T>, index: number): T {
  const item = list[index];
  if (item === undefined)
    throw new RangeError(`index ${index} is outside a list of ${list.length}`);
  return item;
}

export const lastOf = <T>(list: ArrayLike<T>): T => itemAt(list, list.length - 1);

export function valueOf<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new RangeError(`no entry for ${String(key)}`);
  return value;
}
