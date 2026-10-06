/**
 * Pure. Brackets in a label: never left open. A pair is closed when its opener starts the text (the rest is the
 * label of that pair), and the opener with whatever follows it is dropped otherwise; a closer with no opener is dropped
 * when it is a CJK one (an ASCII `)` is usually a list marker such as `1)`).
 */
const PAIRS: Record<string, string> = {
  '(': ')',
  '[': ']',
  '{': '}',
  '（': '）',
  '［': '］',
  '｛': '｝',
  '【': '】',
  '「': '」',
  '『': '』',
  '《': '》',
  '〈': '〉',
  '〔': '〕',
  '“': '”',
};
const CJK_CLOSER = /[）］｝】」』》〉〕”]/;
const TRAILING_JOINER = /[\s,，、:：;；\-–—·|/]+$/u;

/** The bracket depth before each grapheme index (and after the last one). */
export function brackets(gs: readonly string[]): number[] {
  const out: number[] = [];
  const stack: string[] = [];
  for (const g of gs) {
    out.push(stack.length);
    if (PAIRS[g]) stack.push(PAIRS[g]!);
    else if (stack.at(-1) === g) stack.pop();
  }
  out.push(stack.length);
  return out;
}

export function balanceBrackets(text: string): string {
  let t = text;
  for (let guard = 0; guard < 64; guard++) {
    const open: { close: string; at: number }[] = [];
    const stray: number[] = [];
    for (let i = 0; i < t.length; i++) {
      const ch = t[i]!;
      if (PAIRS[ch]) open.push({ close: PAIRS[ch]!, at: i });
      else if (open.at(-1)?.close === ch) open.pop();
      else if (CJK_CLOSER.test(ch)) stray.push(i);
    }
    if (stray.length) {
      t = t
        .split('')
        .filter((_, i) => !stray.includes(i))
        .join('');
      continue;
    }
    const last = open.at(-1);
    if (!last) return t;
    const before = t.slice(0, last.at).replace(TRAILING_JOINER, '');
    if (before) t = before;
    else t = t.slice(last.at + 1).trim() ? t + last.close : '';
  }
  return t;
}
