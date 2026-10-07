import { parseInline, type Span } from './markdown-inline.js';
import { neutralizeHtml } from './text-html.js';

/**
 * Pure. The block structure of an agent's reply: paragraphs, headings, nested bullet / numbered / task lists, tables,
 * quotes, rules and fenced code (an unclosed fence runs to the end, as in a reply that is still streaming). Output is
 * data for a renderer to turn into elements, so nothing a reply says is ever HTML.
 */
type Align = 'left' | 'center' | 'right' | null;
export type ListItem = { checked: boolean | null; blocks: MdBlock[] };
export type MdBlock =
  | { type: 'paragraph'; inline: Span[] }
  | { type: 'heading'; level: number; inline: Span[] }
  | { type: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { type: 'code'; text: string; lang?: string }
  | { type: 'table'; head: Span[][]; align: Align[]; rows: Span[][][] }
  | { type: 'quote'; blocks: MdBlock[] }
  | { type: 'rule' };

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([^\s`]*)/;
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)(?:\s+#+)?\s*$/;
const RULE = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
const BULLET = /^(\s*)[-*+]\s+(.*)$/;
const NUMBERED = /^(\s*)(\d{1,9})[.)]\s+(.*)$/;
const TASK = /^\[([ xX])\]\s+(.*)$/;
const QUOTE = /^\s{0,3}>\s?(.*)$/;
const TABLE_RULE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

const indentOf = (line: string) => {
  const spaced = line.replace(/\t/g, '    ');
  return spaced.length - spaced.trimStart().length;
};
/** The line at `i`; blocks only ask inside the bounds they just checked. */
const lineAt = (lines: string[], i: number) => lines[i] ?? '';
const marker = (line: string) => BULLET.exec(line) ?? NUMBERED.exec(line);

function cells(line: string): string[] {
  const row = line
    .trim()
    .replace(/^\|/, '')
    .replace(/(?<!\\)\|$/, '');
  return row.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}
const alignOf = (cell: string): Align =>
  /^:-+:$/.test(cell) ? 'center' : /-:$/.test(cell) ? 'right' : /^:-/.test(cell) ? 'left' : null;

/** The list that starts at `lines[at]`: its items (with their nested blocks) and the index just past it. */
function readList(
  lines: string[],
  at: number,
  first: RegExpExecArray,
): { block: MdBlock; next: number } {
  const ordered = NUMBERED.test(lineAt(lines, at)) && !BULLET.test(lineAt(lines, at));
  const base = indentOf(lineAt(lines, at));
  const items: ListItem[] = [];
  let i = at;
  while (i < lines.length) {
    const line = lineAt(lines, i);
    const head = marker(line);
    if (!head || indentOf(line) !== base || (NUMBERED.test(line) && !BULLET.test(line)) !== ordered)
      break;
    let text = (ordered ? head[3] : head[2]) ?? '';
    const task = ordered ? null : TASK.exec(text);
    if (task) text = task[2] ?? '';
    const body = [text];
    let j = i + 1;
    // The item continues over lines indented deeper than its marker, and over blank lines between them.
    while (j < lines.length) {
      const line = lineAt(lines, j);
      if (line.trim() === '') {
        const ahead = lines.slice(j).find((l) => l.trim() !== '');
        if (ahead === undefined || indentOf(ahead) <= base) break;
      } else if (indentOf(line) <= base) break;
      body.push(line);
      j++;
    }
    const inner = body.slice(1).filter((l) => l.trim() !== '');
    const cut = inner.length ? Math.min(...inner.map(indentOf)) : 0;
    const dedented = [
      text,
      ...body.slice(1).map((l) => l.replace(new RegExp(`^\\s{0,${cut}}`), '')),
    ];
    items.push({ checked: task ? task[1] !== ' ' : null, blocks: parseBlocks(dedented) });
    i = j;
    while (
      i < lines.length &&
      lineAt(lines, i).trim() === '' &&
      marker(lines.slice(i).find((l) => l.trim() !== '') ?? '')
    )
      i++;
  }
  const start = ordered ? Number(first[2]) : 1;
  return { block: { type: 'list', ordered, start, items }, next: i };
}

type Read = { block: MdBlock; next: number };

/** The fenced code that opens at `lines[at]`; an unclosed fence runs to the end. */
function readFence(lines: string[], at: number, fence: RegExpExecArray): Read {
  const ticks = fence[1] ?? '';
  const lang = fence[2];
  const code: string[] = [];
  const closer = new RegExp(`^\\s{0,3}${ticks.charAt(0)}{${ticks.length},}\\s*$`);
  let i = at + 1;
  for (; i < lines.length && !closer.test(lineAt(lines, i)); i++) code.push(lineAt(lines, i));
  return { block: { type: 'code', text: code.join('\n'), ...(lang ? { lang } : {}) }, next: i + 1 };
}

/** The run of `>` lines that starts at `lines[at]`, parsed as blocks of their own. */
function readQuote(lines: string[], at: number): Read {
  const quoted: string[] = [];
  let i = at;
  for (; i < lines.length && QUOTE.test(lineAt(lines, i)); i++)
    quoted.push(QUOTE.exec(lineAt(lines, i))?.[1] ?? '');
  return { block: { type: 'quote', blocks: parseBlocks(quoted) }, next: i };
}

/** The table whose header is `lines[at]` and whose rule line is `rule`. */
function readTable(lines: string[], at: number, rule: string): Read {
  const head = cells(lineAt(lines, at));
  const rows: Span[][][] = [];
  let i = at + 2;
  for (
    ;
    i < lines.length && lineAt(lines, i).includes('|') && lineAt(lines, i).trim() !== '';
    i++
  ) {
    const row = cells(lineAt(lines, i));
    rows.push(head.map((_, c) => parseInline(row[c] ?? '')));
  }
  const block: MdBlock = {
    type: 'table',
    head: head.map((c) => parseInline(c)),
    align: cells(rule).map(alignOf),
    rows,
  };
  return { block, next: i };
}

/** The block that starts at `lines[i]`, or null when it is a plain paragraph line. */
function readBlock(lines: string[], i: number): Read | null {
  const line = lineAt(lines, i);
  const fence = FENCE.exec(line);
  if (fence) return readFence(lines, i, fence);
  const heading = HEADING.exec(line);
  if (heading) {
    const inline = parseInline(heading[2] ?? '');
    return { block: { type: 'heading', level: (heading[1] ?? '').length, inline }, next: i + 1 };
  }
  if (RULE.test(line)) return { block: { type: 'rule' }, next: i + 1 };
  if (QUOTE.test(line)) return readQuote(lines, i);
  const head = marker(line);
  if (head) return readList(lines, i, head);
  const rule = lines[i + 1];
  if (line.includes('|') && rule !== undefined && rule.includes('-') && TABLE_RULE.test(rule))
    return readTable(lines, i, rule);
  return null;
}

function parseBlocks(lines: string[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      const inline = parseInline(paragraph.join('\n'));
      if (inline.some((s) => s.text.trim())) blocks.push({ type: 'paragraph', inline });
    }
    paragraph = [];
  };
  for (let i = 0; i < lines.length;) {
    const line = lineAt(lines, i);
    if (line.trim() === '') {
      flush();
      i++;
      continue;
    }
    const read = readBlock(lines, i);
    if (!read) {
      paragraph.push(line.trim());
      i++;
      continue;
    }
    flush();
    blocks.push(read.block);
    i = read.next;
  }
  flush();
  return blocks;
}

// Defence in depth: the server already neutralized the HTML in what it sends, and this makes every renderer safe on its
// own (a tag that is not code never reaches the screen as a tag). It changes nothing in text that was already clean.
export const parseMarkdown = (source: string): MdBlock[] =>
  parseBlocks(neutralizeHtml(source.replace(/\r\n?/g, '\n')).split('\n'));
