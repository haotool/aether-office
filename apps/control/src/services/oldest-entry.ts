/** Drops the entry that was inserted first: a Map remembers insertion order, so this is the oldest. */
export function deleteOldest<K>(map: Map<K, unknown>): void {
  for (const key of map.keys()) {
    map.delete(key);
    return;
  }
}
