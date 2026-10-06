import { parseInline, type Span } from './markdown-inline.js';
import { neutralizeHtml } from './text-html.js';

/**
 * Pure. The block structure of an agent's reply: paragraphs, headings, nested bullet / numbered / task lists, tables,
 * quotes, rules and fenced code (an unclosed fence runs to the end, as in a reply that is still streaming). Output is
 * data for a renderer to turn into elements, so nothing a reply says is ever HTML.
 */
export type Align = 'left' | 'center' | 'right' | null;
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

const indentOf = (line: string) => /^\s*/.exec(line.replace(/\t/g, '    '))![0].length;
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
function readList(lines: string[], at: number): { block: MdBlock; next: number } {
  const first = marker(lines[at]!)!;
  const ordered = NUMBERED.test(lines[at]!) && !BULLET.test(lines[at]!);
  const base = indentOf(lines[at]!);
  const items: ListItem[] = [];
  let i = at;
  while (i < lines.length) {
    const head = marker(lines[i]!);
    if (
      !head ||
      indentOf(lines[i]!) !== base ||
      (NUMBERED.test(lines[i]!) && !BULLET.test(lines[i]!)) !== ordered
    )
      break;
    let text = ordered ? head[3]! : head[2]!;
    const task = ordered ? null : TASK.exec(text);
    if (task) text = task[2]!;
    const body = [text];
    let j = i + 1;
    // The item continues over lines indented deeper than its marker, and over blank lines between them.
    while (j < lines.length) {
      const line = lines[j]!;
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
      lines[i]!.trim() === '' &&
      marker(lines.slice(i).find((l) => l.trim() !== '') ?? '')
    )
      i++;
  }
  const start = ordered ? Number(first[2]) : 1;
  return { block: { type: 'list', ordered, start, items }, next: i };
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
    const line = lines[i]!;
    const fence = FENCE.exec(line);
    if (fence) {
      flush();
      const ticks = fence[1]!;
      const lang = fence[2];
      const code: string[] = [];
      for (
        i++;
        i < lines.length &&
        !new RegExp(`^\\s{0,3}${ticks[0]}{${ticks.length},}\\s*$`).test(lines[i]!);
        i++
      )
        code.push(lines[i]!);
      blocks.push({ type: 'code', text: code.join('\n'), ...(lang ? { lang } : {}) });
      i++;
      continue;
    }
    if (line.trim() === '') {
      flush();
      i++;
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: 'heading', level: heading[1]!.length, inline: parseInline(heading[2]!) });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      flush();
      blocks.push({ type: 'rule' });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      flush();
      const quoted: string[] = [];
      for (; i < lines.length && QUOTE.test(lines[i]!); i++)
        quoted.push(QUOTE.exec(lines[i]!)![1]!);
      blocks.push({ type: 'quote', blocks: parseBlocks(quoted) });
      continue;
    }
    if (marker(line)) {
      flush();
      const { block, next } = readList(lines, i);
      blocks.push(block);
      i = next;
      continue;
    }
    const rule = lines[i + 1];
    if (line.includes('|') && rule !== undefined && rule.includes('-') && TABLE_RULE.test(rule)) {
      flush();
      const head = cells(line);
      const rows: Span[][][] = [];
      for (i += 2; i < lines.length && lines[i]!.includes('|') && lines[i]!.trim() !== ''; i++) {
        const row = cells(lines[i]!);
        rows.push(head.map((_, c) => parseInline(row[c] ?? '')));
      }
      blocks.push({
        type: 'table',
        head: head.map((c) => parseInline(c)),
        align: cells(rule).map(alignOf),
        rows,
      });
      continue;
    }
    paragraph.push(line.trim());
    i++;
  }
  flush();
  return blocks;
}

// Defence in depth: the server already neutralized the HTML in what it sends, and this makes every renderer safe on its
// own (a tag that is not code never reaches the screen as a tag). It changes nothing in text that was already clean.
export const parseMarkdown = (source: string): MdBlock[] =>
  parseBlocks(neutralizeHtml(source.replace(/\r\n?/g, '\n')).split('\n'));
