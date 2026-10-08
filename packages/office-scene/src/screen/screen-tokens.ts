import { pick } from '../environment/pick.js';
import { type Rng } from '../environment/seeded.js';
import { VOCAB } from './screen-lang.js';

/** Tokens of generated code: what a code line is made of, and the casing helpers that name things. */
export type TokenKind = 'kw' | 'id' | 'fn' | 'ty' | 'str' | 'num' | 'com' | 'pun' | 'tx';
export type CodeToken = readonly [TokenKind, string];
export type CodeLine = { indent: number; tokens: readonly CodeToken[] };

export const lineText = (line: CodeLine): string =>
  ' '.repeat(line.indent * 2) + line.tokens.map((t) => t[1]).join('');

export const kw = (s: string): CodeToken => ['kw', s];
export const id = (s: string): CodeToken => ['id', s];
export const fn = (s: string): CodeToken => ['fn', s];
export const ty = (s: string): CodeToken => ['ty', s];
export const str = (s: string): CodeToken => ['str', s];
export const num = (s: string): CodeToken => ['num', s];
export const com = (s: string): CodeToken => ['com', s];
export const pun = (s: string): CodeToken => ['pun', s];
export const tx = (s: string): CodeToken => ['tx', s];

export const line = (indent: number, ...tokens: CodeToken[]): CodeLine => ({ indent, tokens });
export const BLANK: CodeLine = { indent: 0, tokens: [] };

/** The words of a file name without its extension: "invoice-totals.ts" gives invoice, totals; "MemberScreen" gives member, screen. */
export function wordsOf(file: string): string[] {
  const stem = file.replace(/\.[^.]*$/, '');
  const words = stem
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w.toLowerCase());
  return words.length ? words.slice(0, 3) : ['main'];
}
const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
export const camel = (ws: readonly string[]) => (ws[0] ?? '') + ws.slice(1).map(cap).join('');
export const pascal = (ws: readonly string[]) => ws.map(cap).join('');
export const snake = (ws: readonly string[]) => ws.join('_');

/** What a generator draws names from: the real file's words and a random stream. */
export type Names = { stem: string[]; r: Rng };

/** Two or three words for an identifier: the file's own words often, the vocabulary otherwise. */
export function nameParts({ stem, r }: Names, withVerb: boolean): string[] {
  const noun = r() < 0.4 ? pick(r, stem) : pick(r, VOCAB.nouns);
  return withVerb ? [pick(r, VOCAB.verbs), noun] : r() < 0.3 ? [pick(r, stem), noun] : [noun];
}
