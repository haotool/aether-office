/**
 * Pure. Which `<name>` in prose is a wrapper (markup a model or a CLI left in text, never shown) and which is plain text
 * (`Array<string>`, `<your-key>` in a sentence). The rule, for a tag that is not an HTML tag `neutralizeHtml` knows:
 *  - a closing tag is always a wrapper: balanced with an opener, or stray;
 *  - an opening tag is a wrapper when its name has a matching closing tag somewhere in the text (a balanced pair), or when
 *    its name holds `-`, `_` or `:` (`task-notification`, `antml:invoke`) and it stands at the start or end of a line;
 *  - never when it is an inline generic: no attributes, directly attached to an identifier (`Array<string>`, `a<b>c`), and
 *    with no closing counterpart.
 * Code spans and fences are not looked at by the caller, so generics and JSX inside code always survive.
 */
export const TAG_NAME = '[a-zA-Z][\\w:.-]*';

export type TagSets = { opens: Set<string>; closes: Set<string> };

const SCAN = new RegExp(`(\`+)[^\`]*?\\1(?!\`)|<(/?)(${TAG_NAME})(?:\\s[^<>]*)?>`, 'g');

/** The names that open and close in prose (code spans skipped), lower-cased, for the balanced-pair test. */
export function tagSets(prose: string): TagSets {
  const sets: TagSets = { opens: new Set(), closes: new Set() };
  if (!prose.includes('<')) return sets;
  for (const m of prose.matchAll(SCAN)) {
    if (m[3] === undefined) continue;
    (m[2] ? sets.closes : sets.opens).add(m[3].toLowerCase());
  }
  return sets;
}

type TagFacts = {
  closing: boolean;
  selfClosing: boolean;
  hasAttrs: boolean;
  /** The character before `<` belongs to an identifier. */
  attached: boolean;
  /** Only whitespace on the line before the tag, or after it. */
  atLineEdge: boolean;
};

const SEPARATED = /[-_:]/;

/** Whether an unknown tag is a wrapper to remove (true) or text to keep (false). `name` is lower-case. */
export function isWrapper(name: string, tag: TagFacts, sets: TagSets): boolean {
  if (tag.closing) return true;
  const balanced = sets.closes.has(name) && sets.opens.has(name);
  if (tag.attached && !tag.hasAttrs && !balanced) return false;
  if (balanced) return !tag.selfClosing;
  return SEPARATED.test(name) && (tag.atLineEdge || tag.hasAttrs || tag.selfClosing);
}

/** Facts about the tag that spans `text[from, to)`. */
export function factsOf(
  text: string,
  from: number,
  to: number,
  m: { closing: boolean; selfClosing: boolean; attrs: string },
): TagFacts {
  return {
    closing: m.closing,
    selfClosing: m.selfClosing,
    hasAttrs: m.attrs.trim().length > 0,
    attached: /[A-Za-z0-9_]/.test(text[from - 1] ?? ''),
    atLineEdge: blankBefore(text, from) || blankAfter(text, to),
  };
}

// Both scans stop at the first character that is not a space: bounded by the whitespace run, never the line.
function blankBefore(text: string, at: number): boolean {
  let i = at - 1;
  while (i >= 0 && (text[i] === ' ' || text[i] === '\t')) i--;
  return i < 0 || text[i] === '\n';
}
function blankAfter(text: string, at: number): boolean {
  let i = at;
  while (i < text.length && (text[i] === ' ' || text[i] === '\t')) i++;
  return i >= text.length || text[i] === '\n';
}
