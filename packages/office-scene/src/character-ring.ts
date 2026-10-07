import type { Ring } from './Animal.js';

/** The ring under a character: in the group picked with Shift or a rectangle, the one chosen, or the one the pointer is over. */
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
