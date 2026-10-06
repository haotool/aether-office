/**
 * Pure. The inline half of the Markdown an agent's reply uses: **bold**, *italic*, ~~strike~~, `code`, links, images and
 * HTML noise. The output is data (styled runs), never HTML: a renderer builds elements from it, so nothing a reply says
 * can inject markup, and only http(s) links keep their address.
 *
 * Unfinished constructs (a reply cut off or still streaming) degrade to styled text, never to visible markers.
 */
export type Span = {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  code?: true;
  /** Only ever an http(s) address. */
  href?: string;
};
type Style = Omit<Span, 'text'>;

/** An address that may be linked: http(s) only, no whitespace or markup characters. Anything else is just its text. */
export function safeHref(url: string): string | null {
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

/** Where the run of `n` backticks that closes a code span starts, or -1. */
function closingTicks(text: string, from: number, n: number): number {
  for (let j = from; j < text.length; j++) {
    if (text[j] !== '`') continue;
    const m = runLength(text, j, '`');
    if (m === n) return j;
    j += m - 1;
  }
  return -1;
}

/** The `[label](url)` that starts at `at` (after any `!`), or null. `end` is just past the closing parenthesis. */
function linkAt(text: string, at: number) {
  let depth = 0;
  let close = -1;
  for (let j = at; j < text.length; j++) {
    const c = text[j];
    if (c === '\\') j++;
    else if (c === '[') depth++;
    else if (c === ']' && --depth === 0) {
      close = j;
      break;
    }
  }
  if (close < 0 || text[close + 1] !== '(') return null;
  let level = 1;
  let j = close + 2;
  for (; j < text.length && level > 0; j++) {
    if (text[j] === '(') level++;
    else if (text[j] === ')') level--;
    else if (text[j] === '\n') break;
  }
  const label = text.slice(at + 1, close);
  if (level > 0) {
    // Cut off inside the address: keep the label, drop the half-written address.
    const stop = text.slice(close + 2).search(/\s/);
    return { label, url: '', end: stop < 0 ? text.length : close + 2 + stop };
  }
  const target = text.slice(close + 2, j - 1).trim();
  return { label, url: /^<([^>]*)>/.exec(target)?.[1] ?? target.split(/\s+/)[0] ?? '', end: j };
}

/** Where the marker that closes the emphasis opened at `from` starts, or -1. */
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

function parse(text: string, style: Style, out: Span[], depth: number) {
  const dead = new Set<string>();
  let buf = '';
  const flush = () => {
    push(out, buf, style);
    buf = '';
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i]!;
    const rest = () => text.slice(i);
    if (c === '\\' && ESCAPABLE.test(text[i + 1] ?? '')) {
      buf += text[i + 1];
      i += 2;
    } else if (c === '`') {
      const n = runLength(text, i, '`');
      const end = closingTicks(text, i + n, n);
      const lineEnd = text.indexOf('\n', i + n);
      const stop = end >= 0 ? end : lineEnd < 0 ? text.length : lineEnd;
      let code = text.slice(i + n, stop).replace(/\n/g, ' ');
      if (code.length > 2 && code.startsWith(' ') && code.endsWith(' ')) code = code.slice(1, -1);
      flush();
      push(out, code, { ...style, code: true });
      i = end >= 0 ? end + n : stop;
    } else if ((c === '[' || (c === '!' && text[i + 1] === '[')) && depth < MAX_DEPTH) {
      const image = c === '!';
      const link = linkAt(text, i + (image ? 1 : 0));
      if (!link) {
        buf += c;
        i++;
        continue;
      }
      flush();
      const href = image ? null : safeHref(link.url);
      const inner = {
        ...style,
        ...(href ? { href } : {}),
        ...(image ? { italic: true as const } : {}),
      };
      parse(link.label, inner, out, depth + 1);
      i = link.end;
    } else if (c === '<') {
      const found = ANGLE_URL.exec(rest());
      const tag = HTML_TAG.exec(rest()) ?? HTML_COMMENT.exec(rest());
      if (found) {
        flush();
        push(out, found[1]!, { ...style, href: found[1]! });
      } else if (tag) {
        if (/^<br/i.test(tag[0])) buf += '\n';
      } else buf += c;
      i += (found ?? tag)?.[0].length ?? 1;
    } else if ((c === 'h' || c === 'H') && !isWord(text[i - 1]) && BARE_URL.test(rest())) {
      let url = BARE_URL.exec(rest())![0];
      while (
        /[),.;:!?'"。，、；：！？）」』]$/.test(url) &&
        (url.at(-1) !== ')' || !url.includes('('))
      )
        url = url.slice(0, -1);
      flush();
      push(out, url, { ...style, ...(safeHref(url) ? { href: url } : {}) });
      i += url.length;
    } else if (
      (c === '*' || c === '_' || c === '~') &&
      depth < MAX_DEPTH &&
      !(c === '_' && isWord(text[i - 1]))
    ) {
      const n = Math.min(runLength(text, i, c), c === '~' ? 2 : 3);
      const run = runLength(text, i, c);
      if (c === '~' && n < 2) {
        buf += text.slice(i, i + run);
        i += run;
        continue;
      }
      const key = `${c}${n}`;
      const end = isSpace(text[i + n]) || dead.has(key) ? -1 : closer(text, c, n, i + n);
      if (end < 0) {
        if (!isSpace(text[i + n])) dead.add(key);
        // A marker with nothing to close it: with a word before it, it is just a character.
        const lenient = n >= 2 && c !== '_' && !isWord(text[i - 1]) && !isSpace(text[i + n]);
        if (lenient) {
          flush();
          const flags: Style =
            c === '~' ? { strike: true } : n === 3 ? { bold: true, italic: true } : { bold: true };
          parse(text.slice(i + n), { ...style, ...flags }, out, depth + 1);
          return;
        }
        buf += text.slice(i, i + run);
        i += run;
        continue;
      }
      flush();
      const flags: Style =
        c === '~'
          ? { strike: true }
          : n === 3
            ? { bold: true, italic: true }
            : n === 2
              ? { bold: true }
              : { italic: true };
      parse(text.slice(i + n, end), { ...style, ...flags }, out, depth + 1);
      i = end + n;
    } else {
      buf += c;
      i++;
    }
  }
  flush();
}

export function parseInline(text: string): Span[] {
  const out: Span[] = [];
  parse(text, {}, out, 0);
  return out;
}

/** The text of runs with every style dropped. */
export const spansText = (spans: readonly Span[]): string => spans.map((s) => s.text).join('');
