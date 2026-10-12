import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { ParseState } from './usage-counters.js';

/** Bump when the parser or the shape of the state changes: an older rollup is then ignored and rebuilt. */
const ROLLUP_VERSION = 5;
export const MAX_TRACKED_FILES = 8192;

export type Entry = {
  state: ParseState;
  offset: number;
  mtime: number;
  size: number;
  sig: string;
  tail: string;
  repo: string | null;
  parent?: string | null;
};

export const keyOf = (file: string) => createHash('sha1').update(file).digest('hex').slice(0, 16);

type Saved = { v: number; tz: string; entries: Record<string, Entry> };

const isEntry = (e: unknown): e is Entry => {
  const entry = e as Entry | null;
  return (
    typeof entry === 'object' &&
    entry !== null &&
    typeof entry.offset === 'number' &&
    typeof entry.mtime === 'number' &&
    typeof entry.size === 'number' &&
    typeof entry.sig === 'string' &&
    typeof entry.tail === 'string' &&
    typeof entry.state === 'object' &&
    entry.state !== null &&
    typeof entry.state.days === 'object'
  );
};

export async function loadRollup(file: string, tz: string): Promise<Map<string, Entry>> {
  try {
    const saved = JSON.parse(await readFile(file, 'utf8')) as Saved;
    if (saved.v !== ROLLUP_VERSION || saved.tz !== tz) return new Map();
    return new Map(Object.entries(saved.entries).filter(([, e]) => isEntry(e)));
  } catch {
    return new Map();
  }
}

/** Writes the rollup next to its final name first, so a crash never leaves half a file. */
export async function saveRollup(
  file: string,
  tz: string,
  entries: ReadonlyMap<string, Entry>,
): Promise<void> {
  const saved: Saved = { v: ROLLUP_VERSION, tz, entries: Object.fromEntries(entries) };
  const temporary = `${file}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(saved), { mode: 0o600 });
  await rename(temporary, file);
}
