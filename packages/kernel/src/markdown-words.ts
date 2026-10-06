import type { PreviewLine } from './markdown-preview.js';

const segmenter = new Intl.Segmenter(undefined, { granularity: 'word' });

/**
 * Pure. `text` as word units by the language's own rules (Chinese words included): each unit is a word with the spaces
 * and punctuation that follow it, so the units joined are the text again. Used to type a reply out, or fade it in, word
 * by word.
 */
export function splitWords(text: string): string[] {
  const units: string[] = [];
  let lead = '';
  for (const { segment, isWordLike } of segmenter.segment(text)) {
    if (isWordLike) {
      units.push(lead + segment);
      lead = '';
    } else if (units.length) units[units.length - 1] += segment;
    else lead += segment;
  }
  if (lead) units.push(lead);
  return units;
}

/** How many word units the lines hold. */
export const countWords = (lines: readonly PreviewLine[]): number =>
  lines.reduce((n, line) => n + line.spans.reduce((m, s) => m + splitWords(s.text).length, 0), 0);

/** The lines as far as their first `count` word units. */
export function revealWords(lines: readonly PreviewLine[], count: number): PreviewLine[] {
  const out: PreviewLine[] = [];
  let left = count;
  for (const line of lines) {
    if (left <= 0) break;
    const spans: PreviewLine['spans'] = [];
    for (const span of line.spans) {
      if (left <= 0) break;
      const units = splitWords(span.text).slice(0, left);
      left -= units.length;
      spans.push({ ...span, text: units.join('') });
    }
    out.push({ ...line, spans });
  }
  return out;
}
