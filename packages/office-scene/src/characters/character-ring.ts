import type { Ring } from '../animals/Animal.js';

export function ringFor(
  id: string,
  {
    group,
    selectedId,
    hoveredId,
  }: { group: ReadonlySet<string>; selectedId: string | null; hoveredId: string | null },
): Ring | null {
  if (group.has(id)) return 'group';
  if (id === selectedId) return 'selected';
  return id === hoveredId ? 'hover' : null;
}
