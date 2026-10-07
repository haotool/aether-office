/**
 * Pure. The keyboard rules of a tree (the WAI-ARIA authoring practice): what a key does on the visible item at `index`.
 * `levels` is every visible item's depth in order; `expanded` is null for an item that cannot open.
 */
type TreeAction = { focus: number } | { open: boolean } | null;

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
      if (expanded === false) return { open: true };
      return expanded && levels[index + 1]! > levels[index]! ? { focus: index + 1 } : null;
    case 'ArrowLeft': {
      if (expanded) return { open: false };
      for (let i = index - 1; i >= 0; i--) if (levels[i]! < levels[index]!) return { focus: i };
      return null;
    }
    default:
      return null;
  }
}
