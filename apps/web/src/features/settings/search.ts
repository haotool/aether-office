import { ENTRIES, type EntryId } from './entries.js';
import { SECTIONS } from './sections.js';

// Settings are found in either language, so this page (a lazy chunk) is the one place that downloads both tables.
const [{ en }, { zh }] = await Promise.all([
  import('../../locales/en.js'),
  import('../../locales/zh.js'),
]);

const normalize = (text: string) => text.normalize('NFKC').toLowerCase();
const tokens = (query: string) => normalize(query).split(/\s+/).filter(Boolean);

/** What a setting is found by: its label and description in both languages, its extra words and its group's name. */
const haystacks = new Map<EntryId, string>(
  ENTRIES.map((entry) => {
    const group = SECTIONS.find((section) => section.id === entry.section)!;
    const parts = [zh[entry.label], zh[entry.desc], en[entry.label], en[entry.desc], entry.words];
    return [entry.id, normalize([...parts, zh[group.label], en[group.label]].join(' '))];
  }),
);

/** The settings that every word of the query appears in, in either language; null when there is nothing to look for. */
export function searchSettings(query: string): ReadonlySet<EntryId> | null {
  const words = tokens(query);
  if (!words.length) return null;
  return new Set(
    ENTRIES.filter((entry) => words.every((w) => haystacks.get(entry.id)!.includes(w))).map(
      (entry) => entry.id,
    ),
  );
}

type Piece = { text: string; hit: boolean };

/** Splits `text` into the runs that match a word of the query and the runs between them. */
export function highlight(text: string, query: string): Piece[] {
  const words = tokens(query);
  const lower = normalize(text);
  // NFKC can change the length (full-width forms); then the positions would not line up, so show the text plain.
  if (!words.length || lower.length !== text.length) return [{ text, hit: false }];
  const marked = new Array<boolean>(text.length).fill(false);
  for (const word of words)
    for (let at = lower.indexOf(word); at >= 0; at = lower.indexOf(word, at + word.length))
      marked.fill(true, at, at + word.length);
  const pieces: Piece[] = [];
  for (let i = 0; i < text.length; i++) {
    const last = pieces[pieces.length - 1];
    if (last && last.hit === marked[i]) last.text += text[i];
    else pieces.push({ text: text[i]!, hit: marked[i]! });
  }
  return pieces;
}
