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

export function brackets(gs: readonly string[]): number[] {
  const out: number[] = [];
  const stack: string[] = [];
  for (const g of gs) {
    out.push(stack.length);
    const closer = PAIRS[g];
    if (closer) stack.push(closer);
    else if (stack.at(-1) === g) stack.pop();
  }
  out.push(stack.length);
  return out;
}

function scanBracketPass(t: string): { open: { close: string; at: number }[]; stray: number[] } {
  const open: { close: string; at: number }[] = [];
  const stray: number[] = [];
  for (let i = 0; i < t.length; i++) {
    const ch = t.charAt(i);
    const closer = PAIRS[ch];
    if (closer) open.push({ close: closer, at: i });
    else if (open.at(-1)?.close === ch) open.pop();
    else if (CJK_CLOSER.test(ch)) stray.push(i);
  }
  return { open, stray };
}

function dropStrayClosers(t: string, stray: number[]): string {
  return t
    .split('')
    .filter((_, i) => !stray.includes(i))
    .join('');
}

function trimUnclosedOpener(t: string, last: { close: string; at: number }): string {
  const before = t.slice(0, last.at).replace(TRAILING_JOINER, '');
  if (before) return before;
  return t.slice(last.at + 1).trim() ? t + last.close : '';
}

export function balanceBrackets(text: string): string {
  let t = text;
  for (let guard = 0; guard < 64; guard++) {
    const { open, stray } = scanBracketPass(t);
    if (stray.length) {
      t = dropStrayClosers(t, stray);
      continue;
    }
    const last = open.at(-1);
    if (!last) return t;
    t = trimUnclosedOpener(t, last);
  }
  return t;
}
