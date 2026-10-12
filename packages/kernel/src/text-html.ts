import { decodeCodeEntities, decodeEntities } from './text-entities.js';
import { closingTicks } from './markdown-inline.js';
import { htmlTable } from './text-table.js';
import { factsOf, isWrapper, tagSets, TAG_NAME, type TagSets } from './text-tags.js';

/**
 * A tag from the HTML list is converted when it is well formed; any other `<name>` is a wrapper to remove (text kept)
 * only when `text-tags.ts` says so, so `Array<string>`, `a < b` and `x<y>z` stay text. Code spans and fences are
 * untouched; running it on its own output changes nothing.
 */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const NAME = TAG_NAME;
const ATTR = `\\s+[^\\s"'<>/=]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+))?`;
const TAG = new RegExp(`<(/?)(${NAME})((?:${ATTR})*)\\s*(/?)>`, 'y');
const CUT_TAG = new RegExp(`<(${NAME})\\s+[\\w:-]+\\s*=[^>\\n]{0,300}$`, 'my');
const PLAIN = /[^\\`<]+/y;

const MAX_OPEN = 64;
const DROP_WITH_CONTENT = new Set(['script', 'style', 'noscript', 'template']);
const BLOCKS = new Set(
  'p div section article header footer main nav aside figure figcaption center details dl dt dd address caption'.split(
    ' ',
  ),
);
const WRAPPERS = new Set(
  'span font small sub sup u mark abbr ins kbd tt cite q label thead tbody tfoot tr td th colgroup col big var samp dfn'.split(
    ' ',
  ),
);
const KNOWN = new Set([
  ...DROP_WITH_CONTENT,
  ...BLOCKS,
  ...WRAPPERS,
  ...'pre code table img br hr b strong i em s del strike a ul ol li h1 h2 h3 h4 h5 h6 blockquote summary'.split(
    ' ',
  ),
]);
const EMPHASIS: Record<string, string> = {
  b: '**',
  strong: '**',
  i: '*',
  em: '*',
  s: '~~',
  del: '~~',
  strike: '~~',
};

const attrOf = (attrs: string, name: string): string | null => {
  const m = new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\`]+))`, 'i').exec(
    attrs,
  );
  const value = m ? (m[1] ?? m[2] ?? m[3]) : undefined;
  return value === undefined ? null : decodeCodeEntities(value);
};
const stripTags = (text: string) => text.replace(/<\/?[a-zA-Z][^<>]*>/g, '');
const fenceFor = (code: string, min: number) =>
  '`'.repeat(Math.max(min, ...(code.match(/`+/g) ?? []).map((r) => r.length + 1)));

function wrapEmphasis(inner: string, mark: string): string {
  const [, lead = '', body = '', trail = ''] = /^(\s*)([\s\S]*?)(\s*)$/.exec(inner) ?? [];
  return body ? `${lead}${mark}${body}${mark}${trail}` : inner;
}

function wrapLink(inner: string, href: string | null): string {
  const url = href?.trim() ?? '';
  if (!/^https?:\/\/[^\s<>"'`]+$/i.test(url)) return inner;
  const label = inner.replace(/[[\]]/g, '').trim();
  return label && label !== url ? `[${label}](${url.replace(/\)/g, '%29')})` : url;
}

type Open = { name: string; start: number; href: string | null };
type Tag = { name: string; closing: boolean; selfClosing: boolean; attrs: string };

type Run = {
  text: string;
  lower: string;
  sets: TagSets;
  out: string[];
  last: string;
  open: Open[];
  lists: { ordered: boolean; n: number }[];
};

function put(run: Run, piece: string) {
  if (!piece) return;
  run.out.push(piece);
  run.last = piece.slice(-1);
}

function dropped(run: Run, at: number): number {
  put(run, gap(run.last, run.text[at]));
  let next = at;
  if (run.last === ' ') while (run.text[next] === ' ') next++;
  return next;
}

function close(run: Run, entry: Open) {
  const inner = run.out.splice(entry.start).join('');
  put(
    run,
    entry.name === 'a'
      ? wrapLink(inner, entry.href)
      : wrapEmphasis(inner, EMPHASIS[entry.name] ?? ''),
  );
  run.last = run.out.at(-1)?.at(-1) ?? '';
}

function skipTo(run: Run, marker: string, from: number): number {
  const end = run.lower.indexOf(marker, from);
  return end < 0 ? run.text.length : end + marker.length;
}

function prose(text: string, sets: TagSets): string {
  const lowered = text.toLowerCase();
  const run: Run = {
    text,
    lower: lowered.length === text.length ? lowered : text,
    sets,
    out: [],
    last: '',
    open: [],
    lists: [],
  };
  let i = 0;
  while (i < text.length) i = step(run, i);
  for (const entry of run.open.reverse()) close(run, entry);
  return run.out.join('');
}

function step(run: Run, i: number): number {
  const { text } = run;
  const c = text[i];
  if (c === '\\') {
    put(run, text.slice(i, i + 2));
    return i + 2;
  }
  if (c === '`') return codeSpan(run, i);
  if (c !== '<') {
    PLAIN.lastIndex = i;
    const plain = PLAIN.exec(text)?.[0] ?? '';
    put(run, decodeEntities(plain));
    return i + plain.length;
  }
  return text.startsWith('<!--', i) ? skipTo(run, '-->', i + 4) : tag(run, i);
}

function codeSpan(run: Run, i: number): number {
  const { text } = run;
  const n = /^`+/.exec(text.slice(i, i + 64))?.[0].length ?? 1;
  const end = closingTicks(text, i + n, n);
  put(run, end < 0 ? text.slice(i, i + n) : text.slice(i, end + n));
  return end < 0 ? i + n : end + n;
}

function tag(run: Run, i: number): number {
  const { text } = run;
  TAG.lastIndex = i;
  const m = TAG.exec(text);
  if (!m) return literalOrCut(run, i);
  const [whole, slash = '', raw = '', attrs = '', self = ''] = m;
  const name = raw.toLowerCase();
  const generic = !slash && name.length === 1 && !attrs && /[A-Za-z0-9_]/.test(text[i - 1] ?? '');
  if (generic) return literalOrCut(run, i);
  const end = i + whole.length;
  if (!KNOWN.has(name)) {
    const facts = factsOf(text, i, end, { closing: !!slash, selfClosing: !!self, attrs });
    return isWrapper(name, facts, run.sets) ? dropped(run, end) : literalOrCut(run, i);
  }
  return knownTag(run, end, { name, closing: slash === '/', selfClosing: !!self, attrs });
}

/** A `<` that is no tag: kept as text, unless it opens a tag cut off inside its attributes, which is dropped. */
function literalOrCut(run: Run, i: number): number {
  CUT_TAG.lastIndex = i;
  const cut = CUT_TAG.exec(run.text);
  const cutName = cut?.[1] ?? '';
  if (cut && (KNOWN.has(cutName.toLowerCase()) || /[-_:]/.test(cutName))) return i + cut[0].length;
  put(run, '<');
  return i + 1;
}

function knownTag(run: Run, i: number, t: Tag): number {
  const { name, closing } = t;
  if (DROP_WITH_CONTENT.has(name))
    return closing ? i : skipPast(run.text, skipTo(run, `</${name}`, i));
  if (!closing && (name === 'pre' || name === 'code' || name === 'table'))
    return rawElement(run, i, name);
  if (name === 'img') put(run, decodeEntities(attrOf(t.attrs, 'alt') ?? ''));
  else if (name === 'br') put(run, '\n');
  else if (name === 'hr') put(run, '\n\n---\n\n');
  else if (EMPHASIS[name] !== undefined || name === 'a') inlineTag(run, t);
  else return structureTag(run, i, t);
  return i;
}

function rawElement(run: Run, i: number, name: 'pre' | 'code' | 'table'): number {
  const { text } = run;
  const end = run.lower.indexOf(`</${name}`, i);
  const inner = end < 0 ? text.slice(i) : text.slice(i, end);
  if (name === 'pre') put(run, preBlock(inner));
  else if (name === 'code') put(run, codeInline(inner));
  else put(run, htmlTable(inner, neutralizeHtml));
  return end < 0 ? text.length : skipPast(text, end);
}

function preBlock(inner: string): string {
  const lang = /<code[^<>]*\sclass\s*=\s*["'][^"']*language-([\w+-]+)/i.exec(inner)?.[1] ?? '';
  const code = decodeCodeEntities(stripTags(inner)).replace(/^\n|\n$/g, '');
  const fence = fenceFor(code, 3);
  return `\n\n${fence}${lang}\n${code}\n${fence}\n\n`;
}

function codeInline(inner: string): string {
  const code = decodeCodeEntities(stripTags(inner))
    .replace(/\s*\n\s*/g, ' ')
    .trim();
  const ticks = fenceFor(code, 1);
  const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
  return code ? `${ticks}${pad}${code}${pad}${ticks}` : '';
}

function inlineTag(run: Run, t: Tag) {
  const { name } = t;
  if (t.closing) {
    const at = run.open.findLastIndex((o) => group(o.name) === group(name));
    if (at >= 0) for (const entry of run.open.splice(at).reverse()) close(run, entry);
  } else if (!t.selfClosing && run.open.length < MAX_OPEN)
    run.open.push({
      name,
      start: run.out.length,
      href: name === 'a' ? attrOf(t.attrs, 'href') : null,
    });
}

function structureListRoot(run: Run, name: string, closing: boolean): void {
  if (closing) run.lists.pop();
  else run.lists.push({ ordered: name === 'ol', n: 0 });
  put(run, '\n');
}

function structureListItem(run: Run, closing: boolean): void {
  if (closing) return;
  const list = run.lists.at(-1);
  if (list) list.n++;
  const marker = list?.ordered ? `${list.n}.` : '-';
  put(run, `\n${'  '.repeat(Math.max(0, run.lists.length - 1))}${marker} `);
}

function structureHeading(run: Run, name: string, closing: boolean): void {
  put(run, closing ? '\n\n' : `\n\n${'#'.repeat(Number(name.slice(1)))} `);
}

function structureTag(run: Run, i: number, t: Tag): number {
  const { name, closing } = t;
  if (name === 'ul' || name === 'ol') structureListRoot(run, name, closing);
  else if (name === 'li') structureListItem(run, closing);
  else if (/^h[1-6]$/.test(name)) structureHeading(run, name, closing);
  else if (name === 'summary') put(run, closing ? '\n\n' : '\n\n#### ');
  else if (name === 'blockquote') put(run, closing ? '\n\n' : '\n\n> ');
  else if (BLOCKS.has(name)) {
    if (closing && !run.sets.opens.has(name)) return dropped(run, i);
    put(run, '\n\n');
  }
  return i;
}

const WIDE_OR_END = /[\s.,;:!?)\]}\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/;
const gap = (last: string, next: string | undefined) =>
  last !== '' && !WIDE_OR_END.test(last) && next !== undefined && !WIDE_OR_END.test(next)
    ? ' '
    : '';

const group = (name: string) => (name === 'a' ? 'a' : EMPHASIS[name]);
const skipPast = (text: string, from: number) => {
  const end = text.indexOf('>', from);
  return end < 0 ? text.length : end + 1;
};

function fencedLines(lines: string[]): boolean[] {
  let fence: string | null = null;
  return lines.map((line) => {
    const mark = FENCE_LINE.exec(line)?.[1];
    if (fence === null) {
      fence = mark ?? null;
      return fence !== null;
    }
    if (mark && mark[0] === fence[0] && mark.length >= fence.length && CLOSING_FENCE.test(line))
      fence = null;
    return true;
  });
}

export function neutralizeHtml(markdown: string): string {
  if (!markdown.includes('<') && !markdown.includes('&')) return markdown;
  const lines = markdown.split('\n');
  const fenced = fencedLines(lines);
  const sets = tagSets(lines.filter((_, i) => !fenced[i]).join('\n'));
  const pieces: string[] = [];
  let buffer: string[] = [];
  const flush = () => {
    if (buffer.length)
      pieces.push(
        prose(buffer.join('\n'), sets)
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n'),
      );
    buffer = [];
  };
  lines.forEach((line, i) => {
    if (fenced[i]) {
      flush();
      pieces.push(line);
    } else buffer.push(line);
  });
  flush();
  return pieces.join('\n').replace(/^\n+/, '').trimEnd();
}
