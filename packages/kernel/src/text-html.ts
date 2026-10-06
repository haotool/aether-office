import { decodeCodeEntities, decodeEntities } from './text-entities.js';
import { htmlTable } from './text-table.js';
import { factsOf, isWrapper, tagSets, TAG_NAME, type TagSets } from './text-tags.js';

/**
 * Pure. HTML that a model or a CLI left in prose, turned into safe Markdown or plain text. The result is data for the
 * Markdown renderer, never markup. A tag from the HTML list is converted when it is well formed; any other `<name>` is a
 * wrapper to remove (its text kept) when `text-tags.ts` says so (a balanced pair, a stray closer, a `task-notification`
 * style name), so `Array<string>`, `Map<K, V>`, `a < b` and `x<y>z` are text and stay untouched. Code spans and fenced
 * blocks are left exactly as written. Running it on its own output changes nothing.
 */
const FENCE_LINE = /^ {0,3}(`{3,}|~{3,})/;
const CLOSING_FENCE = /^ {0,3}(`{3,}|~{3,})\s*$/;
const NAME = TAG_NAME;
const ATTR = `\\s+[^\\s"'<>/=]+(?:\\s*=\\s*(?:"[^"]*"|'[^']*'|[^\\s"'=<>\`]+))?`;
const TAG = new RegExp(`<(/?)(${NAME})((?:${ATTR})*)\\s*(/?)>`, 'y');
// A tag cut off inside its attributes (`<span class="tx`): nothing on the rest of the line is prose worth keeping.
const CUT_TAG = new RegExp(`<(${NAME})\\s+[\\w:-]+\\s*=[^>\\n]{0,300}$`, 'my');
const PLAIN = /[^\\`<]+/y;

/** Emphasis and links nested deeper than this are dropped, which bounds the work of closing them. */
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
const fenceFor = (code: string, min: number, ch: string) =>
  ch.repeat(
    Math.max(min, ...(code.match(new RegExp(`${ch}+`, 'g')) ?? []).map((r) => r.length + 1)),
  );

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

function prose(text: string, sets: TagSets): string {
  // Pieces, not one string: slicing a string that is being appended to copies it every time, which made a long run of
  // `<b>x</b>` quadratic. `last` is the final character written, for the spacing around a removed wrapper.
  const out: string[] = [];
  let last = '';
  const put = (piece: string) => {
    if (!piece) return;
    out.push(piece);
    last = piece.at(-1)!;
  };
  /** After a tag is removed at `at`: a space where it sat between two words, and no double space where it sat between two. */
  const dropped = (at: number) => {
    put(gap(last, text[at]));
    let next = at;
    if (last === ' ') while (text[next] === ' ') next++;
    return next;
  };
  const lowered = text.toLowerCase();
  const lower = lowered.length === text.length ? lowered : text;
  const open: Open[] = [];
  const lists: { ordered: boolean; n: number }[] = [];
  const close = (entry: Open) => {
    const inner = out.splice(entry.start).join('');
    put(
      entry.name === 'a' ? wrapLink(inner, entry.href) : wrapEmphasis(inner, EMPHASIS[entry.name]!),
    );
    last = out.at(-1)?.at(-1) ?? '';
  };
  const skipTo = (marker: string, from: number) => {
    const end = lower.indexOf(marker, from);
    return end < 0 ? text.length : end + marker.length;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    if (c === '\\' && i + 1 < text.length) {
      put(text.slice(i, i + 2));
      i += 2;
    } else if (c === '`') {
      const n = /^`+/.exec(text.slice(i, i + 64))![0].length;
      const end = closingTicks(text, i + n, n);
      // A run of ticks that is not exactly closed is not a code span; the next candidate starts after it.
      put(end < 0 ? text.slice(i, i + n) : text.slice(i, end + n));
      i = end < 0 ? i + n : end + n;
    } else if (c !== '<') {
      PLAIN.lastIndex = i;
      const run = PLAIN.exec(text)![0];
      put(decodeEntities(run));
      i += run.length;
    } else if (text.startsWith('<!--', i)) {
      i = skipTo('-->', i + 4);
    } else {
      TAG.lastIndex = i;
      const m = TAG.exec(text);
      const name = m?.[2]!.toLowerCase();
      const attrs = m?.[3] ?? '';
      const generic =
        !!m && !m[1] && name!.length === 1 && !attrs && /[A-Za-z0-9_]/.test(text[i - 1] ?? '');
      if (m && !generic && !KNOWN.has(name!)) {
        const facts = factsOf(text, i, i + m[0].length, {
          closing: !!m[1],
          selfClosing: !!m[4],
          attrs,
        });
        if (isWrapper(name!, facts, sets)) {
          i += m[0].length;
          i = dropped(i);
          continue;
        }
      }
      if (!m || !KNOWN.has(name!) || generic) {
        CUT_TAG.lastIndex = i;
        const cut = CUT_TAG.exec(text);
        if (cut && (KNOWN.has(cut[1]!.toLowerCase()) || /[-_:]/.test(cut[1]!))) i += cut[0].length;
        else {
          put('<');
          i++;
        }
        continue;
      }
      const closing = m[1] === '/';
      i += m[0].length;
      if (DROP_WITH_CONTENT.has(name!)) {
        if (!closing) i = skipPast(text, skipTo(`</${name}`, i));
      } else if (name === 'pre' && !closing) {
        const end = lower.indexOf('</pre', i);
        const inner = end < 0 ? text.slice(i) : text.slice(i, end);
        const lang = /<code[^>]*\sclass\s*=\s*["'][^"']*language-([\w+-]+)/i.exec(inner)?.[1] ?? '';
        const code = decodeCodeEntities(stripTags(inner)).replace(/^\n|\n$/g, '');
        const fence = fenceFor(code, 3, '`');
        put(`\n\n${fence}${lang}\n${code}\n${fence}\n\n`);
        i = end < 0 ? text.length : skipPast(text, end);
      } else if (name === 'code' && !closing) {
        const end = lower.indexOf('</code', i);
        const code = decodeCodeEntities(stripTags(end < 0 ? text.slice(i) : text.slice(i, end)))
          .replace(/\s*\n\s*/g, ' ')
          .trim();
        const ticks = fenceFor(code, 1, '`');
        const pad = code.startsWith('`') || code.endsWith('`') ? ' ' : '';
        if (code) put(`${ticks}${pad}${code}${pad}${ticks}`);
        i = end < 0 ? text.length : skipPast(text, end);
      } else if (name === 'table' && !closing) {
        const end = lower.indexOf('</table', i);
        put(htmlTable(end < 0 ? text.slice(i) : text.slice(i, end), neutralizeHtml));
        i = end < 0 ? text.length : skipPast(text, end);
      } else if (name === 'img') {
        put(decodeEntities(attrOf(attrs, 'alt') ?? ''));
      } else if (name === 'br') put('\n');
      else if (name === 'hr') put('\n\n---\n\n');
      else if (EMPHASIS[name!] !== undefined || name === 'a') {
        if (closing) {
          const at = open.findLastIndex((o) => group(o.name) === group(name!));
          if (at >= 0) for (const entry of open.splice(at).reverse()) close(entry);
        } else if (!m[4] && open.length < MAX_OPEN)
          open.push({
            name: name!,
            start: out.length,
            href: name === 'a' ? attrOf(attrs, 'href') : null,
          });
      } else if (name === 'ul' || name === 'ol') {
        if (closing) lists.pop();
        else lists.push({ ordered: name === 'ol', n: 0 });
        put('\n');
      } else if (name === 'li') {
        if (!closing) {
          const list = lists.at(-1);
          if (list) list.n++;
          const marker = list?.ordered ? `${list.n}.` : '-';
          put(`\n${'  '.repeat(Math.max(0, lists.length - 1))}${marker} `);
        }
      } else if (/^h[1-6]$/.test(name!)) {
        put(closing ? '\n\n' : `\n\n${'#'.repeat(Number(name![1]))} `);
      } else if (name === 'summary') put(closing ? '\n\n' : '\n\n#### ');
      else if (name === 'blockquote') put(closing ? '\n\n' : '\n\n> ');
      // A block tag breaks the paragraph; a closer that opens nothing in this text is only noise, and breaks nothing.
      else if (BLOCKS.has(name!)) {
        if (closing && !sets.opens.has(name!)) i = dropped(i);
        else put('\n\n');
      }
      // Every other known tag (span, font, small, sub, …) is only a wrapper: dropped, its text kept.
    }
  }
  for (const entry of open.reverse()) close(entry);
  return out.join('');
}

/** Where the run of exactly `n` backticks that closes a code span starts, or -1. */
function closingTicks(text: string, from: number, n: number): number {
  for (let j = text.indexOf('`', from); j >= 0; j = text.indexOf('`', j)) {
    let m = 0;
    while (text[j + m] === '`') m++;
    if (m === n) return j;
    j += m;
  }
  return -1;
}

const WIDE_OR_END = /[\s.,;:!?)\]}\u2e80-\u9fff\uff00-\uffef\u3000-\u303f]/;
/** A space where a removed wrapper sat between two words, so `<a-b>x</a-b><c-d>y</c-d>` does not glue `x` to `y`. */
const gap = (last: string, next: string | undefined) =>
  last !== '' && !WIDE_OR_END.test(last) && next !== undefined && !WIDE_OR_END.test(next)
    ? ' '
    : '';

const group = (name: string) => (name === 'a' ? 'a' : EMPHASIS[name]);
/** The index just past the `>` that ends the tag starting at or after `from`. */
const skipPast = (text: string, from: number) => {
  const end = text.indexOf('>', from);
  return end < 0 ? text.length : end + 1;
};

/** The lines outside fenced blocks: where tags are read. */
function proseOf(markdown: string): string {
  const lines: string[] = [];
  let fence: string | null = null;
  for (const line of markdown.split('\n')) {
    const mark = FENCE_LINE.exec(line)?.[1];
    if (fence !== null) {
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && CLOSING_FENCE.test(line))
        fence = null;
    } else if (mark) fence = mark;
    else lines.push(line);
  }
  return lines.join('\n');
}

export function neutralizeHtml(markdown: string): string {
  if (!markdown.includes('<') && !markdown.includes('&')) return markdown;
  const pieces: string[] = [];
  let buffer: string[] = [];
  let fence: string | null = null;
  const sets = tagSets(proseOf(markdown));
  const flush = () => {
    if (buffer.length)
      pieces.push(
        prose(buffer.join('\n'), sets)
          .replace(/[ \t]+\n/g, '\n')
          .replace(/\n{3,}/g, '\n\n'),
      );
    buffer = [];
  };
  for (const line of markdown.split('\n')) {
    const mark = FENCE_LINE.exec(line)?.[1];
    if (fence !== null) {
      pieces.push(line);
      if (mark && mark[0] === fence[0] && mark.length >= fence.length && CLOSING_FENCE.test(line))
        fence = null;
    } else if (mark) {
      flush();
      pieces.push(line);
      fence = mark;
    } else buffer.push(line);
  }
  flush();
  return pieces.join('\n').replace(/^\n+|\s+$/g, '');
}
