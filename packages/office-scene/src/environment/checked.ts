// Reads whose index or key the caller has already proven (a modulo, a clamp, a non-empty check). They keep that
// invariant checked at runtime: a broken one throws here, not as NaN or "undefined is not an object" much later.
// Elements must be defined: an `undefined` element reads as missing.

/** `list[index]`, or a RangeError when it is out of range. */
export function itemAt<T>(list: ArrayLike<T>, index: number): T {
  const item = list[index];
  if (item === undefined)
    throw new RangeError(`index ${index} is outside a list of ${list.length}`);
  return item;
}

/** The last element of a non-empty list. */
export const lastOf = <T>(list: ArrayLike<T>): T => itemAt(list, list.length - 1);

/** `map.get(key)`, or a RangeError when the key is missing. */
export function valueOf<K, V>(map: ReadonlyMap<K, V>, key: K): V {
  const value = map.get(key);
  if (value === undefined) throw new RangeError(`no entry for ${String(key)}`);
  return value;
}
