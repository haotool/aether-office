import { graphemes } from './markdown-cut.js';
import { toPlainPreview } from './markdown-preview.js';
import { balanceBrackets, brackets } from './text-brackets.js';
import { stripCliWrappers } from './text-wrappers.js';

/**
 * Pure. A session title is a label, not prose: `cleanTitle` makes whatever a provider stored one tidy line of plain text,
 * and `shortLabel` shortens that on a meaning boundary for a name tag. Neither ever leaves a bracket open or cuts inside a
 * user-perceived character, and both give the same answer when run on their own output.
 */
const WIDE =
  /[ᄀ-ᅟ⺀-〾ぁ-㏿㐀-䶿一-꓏가-힣豈-﫿︰-﹯＀-｠￠-￦\u{1f300}-\u{1faff}\u{20000}-\u{3fffd}]/u;
const PICTOGRAPH = /\p{Extended_Pictographic}/u;
const ZERO = /^[\p{M}​-‏⁠﻿️]+$/u;
// Controls, zero-width and bidirectional marks; the zero-width joiner survives only inside an emoji sequence.
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f​‌‎‏‪-‮⁠-⁤⁦-⁩﻿]/gu;
const STRAY_JOINER = /(?<!\p{Extended_Pictographic}️?)‍|‍(?!\p{Extended_Pictographic})/gu;
const LEAD_MARK = /^(?:[-*•·▪▸▶►→✓✔✅🔹🔸🔷▫◦‣]|#{1,6}|>|\d{1,2}[.)])\s+/u;
const QUOTES: Record<string, string> = { '"': '"', "'": "'", '`': '`', '“': '”', '‘': '’' };
const ID_PREFIX = /^(?:cl|cx)·[0-9a-f]{2,}\s*/i;
const SEPARATORS = /[\s,，、:：;；\-–—·|/]+$/u;
const CLAUSE_END = /[。！？.!?；;，,、:：]/u;
const ASCII_WORD = /^[A-Za-z0-9_]/;
const ELLIPSIS = '…';
const TITLE_CHARS = 120;
const LABEL_WIDTH = 28;

/** Terminal columns of one user-perceived character: 2 for East Asian wide characters and emoji, 0 for marks. */
function graphemeWidth(g: string): number {
  if (ZERO.test(g)) return 0;
  return WIDE.test(g) || PICTOGRAPH.test(g) ? 2 : 1;
}
export const displayWidth = (text: string): number =>
  graphemes(text).reduce((sum, g) => sum + graphemeWidth(g), 0);

function once(raw: string): string {
  let t = toPlainPreview(stripCliWrappers(raw.replace(INVISIBLE, '').replace(STRAY_JOINER, '')))
    .replace(/\s+/g, ' ')
    .trim();
  for (let again = true; again;) {
    const before = t;
    const close = QUOTES[t[0] ?? ''];
    if (close && t.length > 1 && t.endsWith(close)) t = t.slice(1, -1).trim();
    t = t.replace(LEAD_MARK, '');
    again = t !== before;
  }
  return t;
}

function cutBoundaryTiers(
  gs: readonly string[],
  depth: readonly number[],
): ((i: number) => boolean)[] {
  const before = (i: number) => gs[i - 1] ?? '';
  const midWord = (i: number) => ASCII_WORD.test(before(i)) && ASCII_WORD.test(gs[i] ?? '');
  return [
    (i) => depth[i] === 0 && (CLAUSE_END.test(before(i)) || gs[i] === ' '),
    (i) => CLAUSE_END.test(before(i)) || gs[i] === ' ',
    (i) => depth[i] === 0 && !midWord(i),
    (i) => !midWord(i),
  ];
}

function pickCutIndex(
  at: number,
  floor: number,
  sum: (to: number) => number,
  tiers: ((i: number) => boolean)[],
): number {
  let pick = 0;
  for (const tier of tiers) {
    for (let i = at; i >= 1 && sum(i) >= floor; i--)
      if (tier(i)) {
        pick = i;
        break;
      }
    if (pick) break;
  }
  return pick || at;
}

/** Whole graphemes of `text` kept up to `max` of `measure`, cut on the best boundary; `null` when it already fits. */
function cutOn(text: string, max: number, measure: (g: string) => number): string | null {
  const gs = graphemes(text);
  const sum = (to: number) => gs.slice(0, to).reduce((s, g) => s + measure(g), 0);
  if (sum(gs.length) <= max) return null;
  const budget = max - measure(ELLIPSIS);
  let limit = 0;
  while (limit < gs.length && sum(limit + 1) <= budget) limit++;
  const depth = brackets(gs);
  const floor = Math.floor(sum(limit) * 0.4);
  const tiers = cutBoundaryTiers(gs, depth);
  for (let at = limit; at >= 1;) {
    const pick = pickCutIndex(at, floor, sum, tiers);
    const kept = balanceBrackets(gs.slice(0, pick).join('').replace(SEPARATORS, ''));
    const result = kept ? kept + ELLIPSIS : ELLIPSIS;
    if (graphemes(result).reduce((s, g) => s + measure(g), 0) <= max) return result;
    at = pick - 1; // closing a bracket made it too wide: cut earlier
  }
  return ELLIPSIS;
}

/** A provider's title as one line of plain text: no markup, no invisible characters, balanced, at most ~120 characters. */
export function cleanTitle(raw: string, maxChars = TITLE_CHARS): string {
  let t = raw;
  for (let pass = 0; pass < 4; pass++) {
    const next = balanceBrackets(once(t));
    const cut = cutOn(next, maxChars, () => 1);
    const result = cut ?? next;
    if (result === t) break;
    t = result;
  }
  return t;
}

type LabelOptions = { maxWidth?: number; repo?: string | null };

/** The short name a tag shows: the title without its id prefix or leading repo name, at most `maxWidth` columns. */
export function shortLabel(title: string, options: LabelOptions = {}): string {
  const max = options.maxWidth ?? LABEL_WIDTH;
  let t = cleanTitle(title).replace(ID_PREFIX, '');
  const repo = options.repo?.trim().toLowerCase();
  if (repo && t.toLowerCase().startsWith(repo)) {
    const rest = t.slice(repo.length);
    if (/^[\s:：\-–—·/]/.test(rest) && rest.replace(/^[\s:：\-–—·/]+/, ''))
      t = rest.replace(/^[\s:：\-–—·/]+/, '');
  }
  const cut = cutOn(t, max, graphemeWidth);
  return cut ?? t;
}
