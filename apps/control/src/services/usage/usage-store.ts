import { createHash } from 'node:crypto';
import { readFile, rename, writeFile } from 'node:fs/promises';
import type { ParseState } from './usage-counters.js';

// What has been read of each transcript so far: the parser's state, how far it got, and the file's modification time
// and size, so a later look reads only the appended bytes. Numbers only; a file is known by a hash of its path. The
// store is bounded, and a small copy of it lives in the data directory so a restart need not read history again.

/** Bump when the parser or the shape of the state changes: an older rollup is then ignored and rebuilt. */
const ROLLUP_VERSION = 5;
export const MAX_TRACKED_FILES = 8192;

export type Entry = {
  state: ParseState;
  /** Bytes of the file already parsed (always at a line boundary). */
  offset: number;
  mtime: number;
  size: number;
  /** The file's first bytes: a different start means the file was rewritten, not appended to. */
  sig: string;
  /** The bytes just before `offset`: a file rewritten in place with the same start and a larger size is not an append. */
  tail: string;
  /** Repository folder the transcript's session ran in, when known. */
  repo: string | null;
  /** Codex: the id of the session that spawned this rollout, whose subagent it is; counted as part of that session. */
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

/** The saved rollup, or an empty store when there is none, it is unreadable, or it was made by another version or zone. */
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
