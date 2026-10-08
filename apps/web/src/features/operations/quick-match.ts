export type QuickItem = { id: string; label: string; hint: string; to: string };

/** Pure. Items whose label or hint contain every word of the query; label-prefix matches first. */
export function matchItems(items: readonly QuickItem[], query: string, limit = 12): QuickItem[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return items.slice(0, limit);
  return items
    .filter((item) => {
      const text = `${item.label} ${item.hint}`.toLowerCase();
      return words.every((w) => text.includes(w));
    })
    .sort((a, b) => {
      const head = words[0] ?? '';
      return (
        Number(!a.label.toLowerCase().startsWith(head)) -
        Number(!b.label.toLowerCase().startsWith(head))
      );
    })
    .slice(0, limit);
}
