/**
 * The inline half of the Markdown an agent's reply uses. The output is data (styled runs), never HTML: a renderer
 * builds elements from it, so nothing a reply says can inject markup.
 */
export type Span = {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  href?: string;
};
type Style = Omit<Span, 'text'>;

function safeHref(url: string): string | null {
  const href = url.trim();
  if (!/^https?:\/\/[^\s<>"'`]+$/i.test(href)) return null;
  try {
    return /^https?:$/.test(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

const HTML_TAGS =
  'a|abbr|b|blockquote|br|center|code|del|details|div|em|font|h[1-6]|hr|i|img|ins|kbd|li|mark|ol|p|pre|s|section|small|span|strong|sub|summary|sup|table|tbody|td|tfoot|th|thead|tr|u|ul';
const HTML_TAG = new RegExp(`^<\\/?(${HTML_TAGS})(\\s[^<>]*)?\\/?>`, 'i');
const HTML_COMMENT = /^<!--[\s\S]*?(-->|$)/;
const ANGLE_URL = /^<(https?:\/\/[^\s<>]+)>/i;
const BARE_URL = /^https?:\/\/[^\s<>]+/i;
const ESCAPABLE = /[!-/:-@[-`{-~]/;
const MAX_DEPTH = 6;

const isSpace = (c: string | undefined) => c === undefined || /\s/.test(c);
const isWord = (c: string | undefined) => c !== undefined && /[\p{L}\p{N}]/u.test(c);

function push(out: Span[], text: string, style: Style) {
  if (!text) return;
  const last = out.at(-1);
  if (
    last &&
    !last.code === !style.code &&
    last.bold === style.bold &&
    last.italic === style.italic &&
    last.strike === style.strike &&
    last.href === style.href
  )
    last.text += text;
  else out.push({ text, ...style });
}

const runLength = (text: string, at: number, ch: string) => {
  let n = 0;
  while (text[at + n] === ch) n++;
  return n;
};

export function closingTicks(text: string, from: number, n: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] !== '`') continue;
    const m = runLength(text, j, '`');
    if (m === n) return j;
    j += m - 1;
  }
  return -1;
}

function linkLabelClose(text: string, at: number): number {
  let depth = 0;
  for (let j = at; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) return j;
  }
  return -1;
}

function linkDestination(text: string, close: number): { url: string; end: number } {
  let level = 1;
  let j = close + 2;
  for (; j < text.length && level > 0; j++) {
    if (text[j] === '(') level++;
    else if (text[j] === ')') level--;
    else if (text[j] === '\n') break;
  }
  if (level > 0) {
    const stop = text.slice(close + 2).search(/\s/);
    return { url: '', end: stop < 0 ? text.length : close + 2 + stop };
  }
  const target = text.slice(close + 2, j - 1).trim();
  const url = /^<([^>]*)>/.exec(target)?.[1] ?? target.split(/\s+/)[0] ?? '';
  return { url, end: j };
}

function linkAt(text: string, at: number) {
  const close = linkLabelClose(text, at);
  if (close < 0 || text[close + 1] !== '(') return null;
  const label = text.slice(at + 1, close);
  const dest = linkDestination(text, close);
  return { label, url: dest.url, end: dest.end };
}

function closer(text: string, marker: string, n: number, from: number): number {
  for (let j = from; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === '`') {
      const m = runLength(text, j, '`');
      const end = closingTicks(text, j + m, m);
      j = end < 0 ? j + m - 1 : end + m - 1;
    } else if (c === marker) {
      const m = runLength(text, j, marker);
      const fits = m === n || (m === 3 && n < 3);
      const after = text[j + m];
      if (fits && j > from && !isSpace(text[j - 1]) && (marker !== '_' || !isWord(after)))
        return j + m - n;
      j += m - 1;
    }
  }
  return -1;
}

type Reader = {
  text: string;
  style: Style;
  out: Span[];
  depth: number;
  dead: Set<string>;
  buf: string;
  i: number;
};

function flush(r: Reader) {
  push(r.out, r.buf, r.style);
  r.buf = '';
}

function parse(text: string, style: Style, out: Span[], depth: number) {
  const r: Reader = { text, style, out, depth, dead: new Set(), buf: '', i: 0 };
  while (r.i < text.length) readOne(r);
  flush(r);
}

function readOne(r: Reader) {
  const { text, i } = r;
  const c = text.charAt(i);
  if (c === '\\' && ESCAPABLE.test(text.charAt(i + 1))) {
    r.buf += text.charAt(i + 1);
    r.i += 2;
  } else if (c === '`') codeSpan(r);
  else if ((c === '[' || (c === '!' && text[i + 1] === '[')) && r.depth < MAX_DEPTH)
    link(r, c === '!');
  else if (c === '<') angle(r);
  else if ((c === 'h' || c === 'H') && !isWord(text[i - 1]) && BARE_URL.test(text.slice(i)))
    bareUrl(r);
  else if (
    (c === '*' || c === '_' || c === '~') &&
    r.depth < MAX_DEPTH &&
    !(c === '_' && isWord(text[i - 1]))
  )
    emphasis(r, c);
  else {
    r.buf += c;
    r.i++;
  }
}

function codeSpan(r: Reader) {
  const { text, i } = r;
  const n = runLength(text, i, '`');
  const end = closingTicks(text, i + n, n);
  const lineEnd = text.indexOf('\n', i + n);
  const stop = end >= 0 ? end : lineEnd < 0 ? text.length : lineEnd;
  let code = text.slice(i + n, stop).replace(/\n/g, ' ');
  if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
  flush(r);
  push(r.out, code, { ...r.style, code: true });
  r.i = end >= 0 ? end + n : stop;
}

function link(r: Reader, image: boolean) {
  const found = linkAt(r.text, r.i + (image ? 1 : 0));
  if (!found) {
    r.buf += r.text.charAt(r.i);
    r.i++;
    return;
  }
  flush(r);
  const href = image ? null : safeHref(found.url);
  const inner = {
    ...r.style,
    ...(href ? { href } : {}),
    ...(image ? { italic: true as const } : {}),
  };
  parse(found.label, inner, r.out, r.depth + 1);
  r.i = found.end;
}

function angle(r: Reader) {
  const rest = r.text.slice(r.i);
  const found = ANGLE_URL.exec(rest);
  const tag = found ? null : (HTML_TAG.exec(rest) ?? HTML_COMMENT.exec(rest));
  if (found) {
    const url = found[1] ?? '';
    flush(r);
    push(r.out, url, { ...r.style, href: url });
  } else if (tag) {
    if (/^<br/i.test(tag[0])) r.buf += '\n';
  } else r.buf += '<';
  r.i += (found ?? tag)?.[0].length ?? 1;
}

function bareUrl(r: Reader) {
  let url = BARE_URL.exec(r.text.slice(r.i))?.[0] ?? '';
  while (/[),.;:!?'"。，、；：！？）」』]$/.test(url) && (url.at(-1) !== ')' || !url.includes('(')))
    url = url.slice(0, -1);
  flush(r);
  push(r.out, url, { ...r.style, ...(safeHref(url) ? { href: url } : {}) });
  r.i += url.length;
}

const emphasisStyle = (c: string, n: number): Style =>
  c === '~'
    ? { strike: true }
    : n === 3
      ? { bold: true, italic: true }
      : n === 2
        ? { bold: true }
        : { italic: true };

function emphasis(r: Reader, c: string) {
  const { text, i } = r;
  const run = runLength(text, i, c);
  const n = Math.min(run, c === '~' ? 2 : 3);
  const key = `${c}${n}`;
  const open = !isSpace(text[i + n]);
  const end = open && n >= (c === '~' ? 2 : 1) && !r.dead.has(key) ? closer(text, c, n, i + n) : -1;
  if (end < 0 && open) r.dead.add(key);
  const lenient = end < 0 && open && n >= 2 && c !== '_' && !isWord(text[i - 1]);
  if (end < 0 && !lenient) {
    r.buf += text.slice(i, i + run);
    r.i += run;
    return;
  }
  flush(r);
  const inner = text.slice(i + n, end < 0 ? undefined : end);
  parse(inner, { ...r.style, ...emphasisStyle(c, n) }, r.out, r.depth + 1);
  r.i = end < 0 ? text.length : end + n;
}

export function parseInline(text: string): Span[] {
  const out: Span[] = [];
  parse(text, {}, out, 0);
  return out;
}

export const spansText = (spans: readonly Span[]): string => spans.map((s) => s.text).join('');
