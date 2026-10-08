/** A stable unsigned 32-bit number from a text (FNV-1a over its UTF-16 units): the same text always gives the same number. */
export function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
