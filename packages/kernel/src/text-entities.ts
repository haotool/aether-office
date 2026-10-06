/**
 * Pure. HTML character references in prose, decoded once. `&lt;` becomes an escaped `\<` so that a literal tag a reply
 * meant to show can never be read as a tag by a later pass (the output is Markdown, and the escape renders as `<`).
 * `&amp;` followed by what looks like another reference stays as it is, so decoding twice never decodes twice.
 */
const NAMED: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '\\<',
  gt: '>',
  quot: '"',
  apos: "'",
  hellip: '…',
  mdash: '—',
  ndash: '–',
  middot: '·',
  bull: '•',
  rarr: '→',
  larr: '←',
  copy: '©',
  times: '×',
};

const REFERENCE = /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|([a-zA-Z][a-zA-Z0-9]{1,8}));/g;
const LOOKS_LIKE_REFERENCE = /^(?:#\d|#[xX][0-9a-fA-F]|[a-zA-Z][a-zA-Z0-9]{1,8};)/;

function fromCodePoint(code: number): string {
  // Controls, surrogates and out-of-range values are dropped, never rendered.
  if (code < 0x20 || (code >= 0x7f && code < 0xa0) || (code >= 0xd800 && code <= 0xdfff))
    return code === 9 || code === 10 ? ' ' : '';
  if (code > 0x10ffff) return '';
  // Characters that Markdown would act on stay escaped, so a decoded reference is never read as syntax.
  return code === 0x3c || code === 0x60 || code === 0x5c
    ? `\\${String.fromCodePoint(code)}`
    : String.fromCodePoint(code);
}

export function decodeEntities(text: string): string {
  return text.replace(
    REFERENCE,
    (whole, dec?: string, hex?: string, name?: string, at?: number) => {
      if (name !== undefined) {
        const value = NAMED[name.toLowerCase()];
        if (value === undefined) return whole;
        const rest = text.slice(at! + whole.length);
        return name.toLowerCase() === 'amp' && LOOKS_LIKE_REFERENCE.test(rest) ? whole : value;
      }
      return fromCodePoint(dec !== undefined ? Number(dec) : parseInt(hex!, 16));
    },
  );
}

/** Entities inside code are decoded too (an HTML `<code>` holds `&lt;`), but into the plain character. */
export const decodeCodeEntities = (text: string): string =>
  decodeEntities(text).replace(/\\([<`\\])/g, '$1');
