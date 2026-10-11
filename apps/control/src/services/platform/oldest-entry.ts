export function deleteOldest<K>(map: Map<K, unknown>): void {
  for (const key of map.keys()) {
    map.delete(key);
    return;
  }
}
