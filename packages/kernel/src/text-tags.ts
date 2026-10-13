/**
 * A closing tag is always a wrapper; an opening tag is one when it has a matching closer or a `-`, `_` or `:` name at a
 * line edge (`task-notification`), never an inline generic (`Array<string>`, `a<b>c`).
 */
export const TAG_NAME = '[a-zA-Z][\\w:.-]*';

export type TagSets = { opens: Set<string>; closes: Set<string> };

const SCAN = new RegExp(
  `(?<!\`)(?=(\`+))\\1[^\`]*?\\1(?!\`)|<(/?)(${TAG_NAME})(?:\\s[^<>]*)?>`,
  'g',
);

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
  attached: boolean;
  atLineEdge: boolean;
};

const SEPARATED = /[-_:]/;

export function isWrapper(name: string, tag: TagFacts, sets: TagSets): boolean {
  if (tag.closing) return true;
  const balanced = sets.closes.has(name) && sets.opens.has(name);
  if (tag.attached && !tag.hasAttrs && !balanced) return false;
  if (balanced) return !tag.selfClosing;
  return SEPARATED.test(name) && (tag.atLineEdge || tag.hasAttrs || tag.selfClosing);
}

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
