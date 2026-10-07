/** Pure. Cutting text on boundaries that keep a user-perceived character, and a Markdown reply, whole. */
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** The user-perceived characters of `text`: an emoji with its modifiers or a surrogate pair is one. */
export const graphemes = (text: string): string[] =>
  Array.from(graphemeSegmenter.segment(text), (s) => s.segment);

const WORD_START = /^[A-Za-z0-9_./-]/;
const FENCE_LINE = /^\s{0,3}(`{3,}|~{3,})/;

/** The fence that is still open at the end of `text` (its marker characters), or null. */
function openFence(text: string): string | null {
  let open: string | null = null;
  for (const line of text.split('\n')) {
    const mark = FENCE_LINE.exec(line)?.[1];
    if (!mark) continue;
    if (open === null) open = mark;
    else if (mark[0] === open[0] && mark.length >= open.length) open = null;
  }
  return open;
}

const countOf = (text: string, what: RegExp) => text.match(what)?.length ?? 0;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A table cut before its delimiter row is only pipes on a page: the lines of it that are there are dropped. */
function dropOpenTable(text: string): string {
  const lines = text.split('\n');
  let start = lines.length;
  while (start > 0 && (lines[start - 1] ?? '').trimStart().startsWith('|')) start--;
  const rule = lines[start + 1];
  if (start === lines.length || (rule !== undefined && TABLE_RULE.test(rule))) return text;
  return lines.slice(0, start).join('\n').trimEnd();
}

/**
 * A reply cut to at most about `max` characters without leaving a half-written construct behind: it never ends inside a
 * word of Latin text or a character, an unfinished link keeps only its label, and an open fence, code span, `**` or `~~`
 * is closed after an ellipsis. Text that already fits is returned unchanged.
 */
export function cutMarkdown(text: string, max: number): string {
  const chars = graphemes(text);
  if (chars.length <= max) return text;
  let head = chars.slice(0, max).join('');
  const next = chars[max] ?? '';
  const word = /\s[A-Za-z0-9_./-]{1,24}$/.exec(head);
  if (word && WORD_START.test(next)) head = head.slice(0, word.index);
  head = head.replace(/\\$/, '').trimEnd();
  const fence = openFence(head);
  if (fence) return `${head}…\n${fence}`;
  head = dropOpenTable(head);
  const lineStart = head.lastIndexOf('\n') + 1;
  const line = head
    .slice(lineStart)
    .replace(/!?\[([^\]\n]*)\]\([^)\n]*$/, '$1')
    .replace(/!?\[([^\]\n]*)$/, '$1');
  let closing = '';
  if (countOf(line, /`/g) % 2) closing += '`';
  if (countOf(line, /\*\*/g) % 2) closing = `**${closing}`;
  if (countOf(line, /~~/g) % 2) closing = `~~${closing}`;
  return `${head.slice(0, lineStart)}${line}…${closing}`;
}
