/** Deterministic topological columns; no pixel layout library is needed for fixed-size task cards. */
export function taskPositions(
  ids: string[],
  dependencies: { workId: string; dependsOn: string }[],
): Map<string, { x: number; y: number }> {
  const incoming = new Map(ids.map((id) => [id, 0]));
  const outgoing = new Map(ids.map((id) => [id, [] as string[]]));
  if (incoming.size !== ids.length) throw new Error('DAG_DUPLICATE_NODE');
  for (const edge of dependencies) {
    if (!incoming.has(edge.workId) || !outgoing.has(edge.dependsOn))
      throw new Error('DAG_DEPENDENCY_NOT_FOUND');
    const prior = incoming.get(edge.workId);
    if (prior === undefined) throw new Error('DAG_DEPENDENCY_NOT_FOUND');
    incoming.set(edge.workId, prior + 1);
    const outs = outgoing.get(edge.dependsOn);
    if (!outs) throw new Error('DAG_DEPENDENCY_NOT_FOUND');
    outs.push(edge.workId);
  }
  const positions = new Map<string, { x: number; y: number }>();
  let layer = ids.filter((id) => incoming.get(id) === 0).sort(),
    column = 0;
  while (layer.length) {
    const next: string[] = [];
    layer.forEach((id, row) => {
      positions.set(id, { x: column * 320, y: row * 132 - (layer.length - 1) * 66 });
      for (const child of outgoing.get(id) ?? []) {
        const count = (incoming.get(child) ?? 0) - 1;
        incoming.set(child, count);
        if (count === 0) next.push(child);
      }
    });
    layer = next.sort();
    column++;
  }
  if (positions.size !== ids.length) throw new Error('DAG_CYCLE');
  return positions;
}
