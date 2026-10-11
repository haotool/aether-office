export function matchOffsets(text: string, query: string, limit = 1000): number[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [];
  const haystack = text.toLowerCase();
  // A few characters change length when lower-cased; offsets into such a text would drift, so it is searched as it is.
  const source = haystack.length === text.length ? haystack : text;
  const found: number[] = [];
  for (let at = source.indexOf(needle); at >= 0 && found.length < limit;) {
    found.push(at);
    at = source.indexOf(needle, at + needle.length);
  }
  return found;
}

type HighlightApi = { set(name: string, highlight: unknown): void; delete(name: string): void };
const registry = (): HighlightApi | null => {
  const css = globalThis.CSS as { highlights?: HighlightApi } | undefined;
  return css?.highlights && typeof Highlight !== 'undefined' ? css.highlights : null;
};

export const canHighlight = () => registry() !== null;

export function findRanges(root: Element, query: string, limit = 1000): Range[] {
  const ranges: Range[] = [];
  if (!query.trim()) return ranges;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (
    let node = walker.nextNode() as Text | null;
    node && ranges.length < limit;
    node = walker.nextNode() as Text | null
  ) {
    for (const at of matchOffsets(node.data, query, limit - ranges.length)) {
      const range = new Range();
      range.setStart(node, at);
      range.setEnd(node, at + query.trim().length);
      ranges.push(range);
    }
  }
  return ranges;
}

export function paintMatches(ranges: readonly Range[], current: number): void {
  const api = registry();
  if (!api) return;
  const make = (list: Range[]) => new Highlight(...list);
  if (!ranges.length) {
    api.delete('conv-find');
    api.delete('conv-find-current');
    return;
  }
  api.set('conv-find', make(ranges.filter((_, i) => i !== current)));
  api.set('conv-find-current', make(ranges[current] ? [ranges[current]] : []));
}
