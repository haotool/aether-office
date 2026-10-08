/**
 * Pure. The keyboard rules of a tree (the WAI-ARIA authoring practice): what a key does on the visible item at `index`.
 * `levels` is every visible item's depth in order; `expanded` is null for an item that cannot open.
 */
type TreeAction = { focus: number } | { open: boolean } | null;

const arrowRight = (
  index: number,
  levels: readonly number[],
  expanded: boolean | null,
): TreeAction => {
  if (expanded === false) return { open: true };
  const here = levels[index];
  const next = levels[index + 1];
  if (expanded && here !== undefined && next !== undefined && next > here)
    return { focus: index + 1 };
  return null;
};

const arrowLeft = (
  index: number,
  levels: readonly number[],
  expanded: boolean | null,
): TreeAction => {
  if (expanded) return { open: false };
  const here = levels[index];
  if (here === undefined) return null;
  for (let i = index - 1; i >= 0; i--) {
    const level = levels[i];
    if (level !== undefined && level < here) return { focus: i };
  }
  return null;
};

export function treeNav(
  key: string,
  index: number,
  levels: readonly number[],
  expanded: boolean | null,
): TreeAction {
  const last = levels.length - 1;
  switch (key) {
    case 'ArrowDown':
      return index < last ? { focus: index + 1 } : null;
    case 'ArrowUp':
      return index > 0 ? { focus: index - 1 } : null;
    case 'Home':
      return { focus: 0 };
    case 'End':
      return { focus: last };
    case 'ArrowRight':
      return arrowRight(index, levels, expanded);
    case 'ArrowLeft':
      return arrowLeft(index, levels, expanded);
    default:
      return null;
  }
}
