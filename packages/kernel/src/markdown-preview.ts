import { parseMarkdown, type ListItem, type MdBlock } from './markdown-blocks.js';
import { spansText, type Span } from './markdown-inline.js';
import { cutMarkdown, graphemes } from './markdown-cut.js';

/**
 * Pure. A Markdown reply as the short, flat text that bubbles, list rows, notifications and titles show: the syntax is
 * gone and the meaning stays (headings become text, list items bullet lines, code spans keep their words, a fenced block is
 * its first line, links their label, tables compact rows). `toInlineSegments` keeps the styling as runs for a renderer;
 * `toPlainPreview` is the same content as a string.
 */
export type PreviewKind = 'text' | 'bullet' | 'heading' | 'code';
export type PreviewLine = {
  kind: PreviewKind;
  /** Nesting depth of a list item, 0 for everything else. */
  depth: number;
  /** The glyph a bullet line starts with: •, 1., ☐ or ☑. */
  marker?: string;
  /** A line break inside a paragraph or list item: the text continues the previous line. */
  soft?: true;
  spans: Span[];
};
export type PreviewOptions = { maxChars?: number; maxLines?: number };

const plain = (text: string): Span => ({ text });
const ELLIPSIS = '…';
const SENTENCE_END = /[.!?。！？:：;；]$/;

function itemLines(item: ListItem, marker: string, depth: number): PreviewLine[] {
  const [first, ...rest] = item.blocks;
  const lead = first?.type === 'paragraph' ? first : null;
  const own: PreviewLine[] = lead
    ? splitLines(lead.inline).map((spans, i) => ({
        kind: 'bullet',
        depth,
        ...(i === 0 ? { marker } : { soft: true as const }),
        spans,
      }))
    : [];
  const more = lead ? rest : item.blocks;
  return [...own, ...more.flatMap((b) => linesOf(b, depth + 1))];
}

/** The runs of a paragraph split at its line breaks; empty lines dropped. */
function splitLines(spans: readonly Span[]): Span[][] {
  const lines: Span[][] = [[]];
  for (const span of spans) {
    const parts = span.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part) lines.at(-1)!.push({ ...span, text: part });
    });
  }
  return lines.filter((l) => l.some((s) => s.text.trim()));
}

function linesOf(block: MdBlock, depth: number): PreviewLine[] {
  switch (block.type) {
    case 'paragraph':
      return splitLines(block.inline).map((spans, i) => ({
        kind: 'text',
        depth: 0,
        ...(i > 0 ? { soft: true as const } : {}),
        spans,
      }));
    case 'heading':
      return [{ kind: 'heading', depth: 0, spans: block.inline }];
    case 'list':
      return block.items.flatMap((item, i) =>
        itemLines(
          item,
          item.checked !== null
            ? item.checked
              ? '☑'
              : '☐'
            : block.ordered
              ? `${block.start + i}.`
              : '•',
          depth,
        ),
      );
    case 'code': {
      const first = block.text.split('\n').find((l) => l.trim());
      return [{ kind: 'code', depth: 0, spans: [{ text: first?.trim() ?? 'code', code: true }] }];
    }
    case 'table':
      return [block.head, ...block.rows].map((row, r) => ({
        kind: 'text',
        depth: 0,
        spans: row.flatMap((cell, c) => [
          ...(c ? [plain(' · ')] : []),
          ...cell.map((s) => (r === 0 ? { ...s, bold: true as const } : s)),
        ]),
      }));
    case 'quote':
      return block.blocks.flatMap((b) => linesOf(b, depth));
    case 'rule':
      return [];
  }
}

/** One line from many: phrases joined by " · ", or by a space inside a paragraph or after a sentence that ended. */
function oneLine(lines: PreviewLine[]): PreviewLine[] {
  if (lines.length < 2) return lines;
  const spans: Span[] = [];
  for (const line of lines) {
    const text = spansText(spans);
    if (text) spans.push(plain(line.soft || SENTENCE_END.test(text.trimEnd()) ? ' ' : ' · '));
    spans.push(...(line.kind === 'code' ? [plain('‹'), ...line.spans, plain('›')] : line.spans));
  }
  return [{ kind: 'text', depth: 0, spans }];
}

const lengthOf = (line: PreviewLine) =>
  graphemes(`${line.marker ?? ''}${line.marker ? ' ' : ''}${spansText(line.spans)}`).length;

/** The first `budget` characters of the runs, and whether anything was left out. */
function clipSpans(spans: readonly Span[], budget: number): { spans: Span[]; cut: boolean } {
  const out: Span[] = [];
  let left = budget;
  for (const span of spans) {
    const chars = graphemes(span.text);
    if (chars.length <= left) {
      out.push(span);
      left -= chars.length;
    } else {
      if (left > 0) out.push({ ...span, text: chars.slice(0, left).join('') });
      return { spans: out, cut: true };
    }
  }
  return { spans: out, cut: false };
}

/** At most `maxLines` lines and `maxChars` characters (the ellipsis included), cut between characters. */
function clip(lines: PreviewLine[], maxChars: number, maxLines: number): PreviewLine[] {
  const kept = lines.slice(0, maxLines);
  const out: PreviewLine[] = [];
  let left = maxChars;
  let more = lines.length > kept.length;
  for (const [i, line] of kept.entries()) {
    const used = lengthOf(line);
    const last = i === kept.length - 1;
    if (left > 0 && used + (last && more ? 1 : 0) <= left) {
      out.push(line);
      left -= used + 1; // the line break
      continue;
    }
    more = false;
    const prefix = line.marker ? graphemes(line.marker).length + 1 : 0;
    const { spans } = clipSpans(line.spans, Math.max(0, left - prefix - 1));
    const tail = spans.at(-1);
    if (tail) spans[spans.length - 1] = { ...tail, text: tail.text.trimEnd() };
    out.push({ ...line, spans: [...spans, plain(ELLIPSIS)] });
    return out;
  }
  const last = out.at(-1);
  if (more && last) out[out.length - 1] = { ...last, spans: [...last.spans, plain(ELLIPSIS)] };
  return out;
}

/** The styled runs of a reply, line by line, with no Markdown syntax left in them. */
export function toInlineSegments(markdown: string, options: PreviewOptions = {}): PreviewLine[] {
  const { maxChars = Infinity, maxLines = Infinity } = options;
  const source = Number.isFinite(maxChars) ? cutMarkdown(markdown, maxChars * 6 + 64) : markdown;
  const lines = parseMarkdown(source).flatMap((b) => linesOf(b, 0));
  return clip(maxLines === 1 ? oneLine(lines) : lines, maxChars, maxLines);
}

const lineText = (line: PreviewLine, oneLiner: boolean) => {
  const body = line.kind === 'code' ? `‹${spansText(line.spans)}›` : spansText(line.spans);
  const marker = line.marker && !oneLiner ? `${' '.repeat(line.depth * 2)}${line.marker} ` : '';
  return `${marker}${body}`;
};

/** A reply as plain text: no Markdown syntax, whitespace collapsed, at most `maxChars` characters and `maxLines` lines. */
export function toPlainPreview(markdown: string, options: PreviewOptions = {}): string {
  const lines = toInlineSegments(markdown, { maxLines: 1, ...options });
  return lines
    .map((l) => lineText(l, options.maxLines === undefined || options.maxLines === 1))
    .join('\n')
    .replace(/(?<=\S)[^\S\n]+/g, ' ')
    .trim();
}
