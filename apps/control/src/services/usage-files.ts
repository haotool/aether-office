import type { Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { UUID_SUFFIX, headOf } from './session-discovery.js';
import { mapPool } from './pool.js';

// Which transcript files can hold usage inside a window: every session file of both providers changed in it, plus the
// files of Claude's sub-agents (<session>/subagents/agent-*.jsonl), which spend tokens of their own. Metadata only.
const MAX_ENTRIES = 24 * 1024; // directory entries visited per provider, newest first
const STAT_WIDTH = 16;
const DAY_MS = 86_400_000;

export type Transcript = {
  provider: 'claude' | 'codex';
  file: string;
  mtime: number;
  size: number;
  /** `provider:sessionId`, the key the session list uses. A sub-agent's file belongs to its parent session. */
  sessionKey: string;
};

const sessionKeyOf = (provider: Transcript['provider'], file: string): string => {
  if (provider === 'claude') {
    const sub = basename(dirname(file)) === 'subagents';
    return `claude:${sub ? basename(dirname(dirname(file))) : basename(file, '.jsonl')}`;
  }
  const base = basename(file, '.jsonl');
  return `codex:${UUID_SUFFIX.exec(base)?.[0] ?? base}`;
};

// Codex shards its sessions by YYYY/MM/DD: a day folder wholly older than the window is not opened at all.
function olderThanWindow(parts: readonly string[], cutoff: number): boolean {
  if (parts.length !== 3) return false;
  const [y, m, d] = parts.map(Number) as [number, number, number];
  return Number.isFinite(Date.UTC(y, m - 1, d)) && Date.UTC(y, m - 1, d) + 2 * DAY_MS < cutoff;
}

type Found = { file: string; mtime: number; size: number };
type Budget = { entries: number; spent: boolean };

/**
 * Collects the transcripts under `dir`. Claude's folders have no date in their names, so a spent budget could drop the
 * newest project: its entries are visited newest first by modification time. Codex's day shards sort by name.
 */
async function walk(
  dir: string,
  parts: string[],
  depth: number,
  out: Found[],
  cutoff: number,
  codex: boolean,
  budget: Budget,
) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  const stats = new Map<string, Stats>();
  if (codex)
    entries.sort((a, b) => (a.name < b.name ? 1 : -1)); // newest shard first: a spent budget drops the oldest
  else {
    await mapPool(entries, STAT_WIDTH, async (e) => {
      if (!e.isSymbolicLink())
        await stat(join(dir, e.name))
          .then((s) => stats.set(e.name, s))
          .catch(() => undefined); // vanished
    });
    const at = (name: string) => stats.get(name)?.mtimeMs ?? 0;
    entries.sort((a, b) => at(b.name) - at(a.name));
  }
  const files: string[] = [];
  for (const e of entries) {
    if (budget.entries-- <= 0) {
      budget.spent = true;
      break;
    }
    if (e.isSymbolicLink()) continue;
    const path = join(dir, e.name);
    if (e.isDirectory() && depth < 5) {
      const next = [...parts, e.name];
      if (!(codex && olderThanWindow(next, cutoff)))
        await walk(path, next, depth + 1, out, cutoff, codex, budget);
    } else if (e.isFile() && e.name.endsWith('.jsonl')) files.push(e.name);
  }
  await mapPool(files, STAT_WIDTH, async (name) => {
    try {
      const s = stats.get(name) ?? (await stat(join(dir, name)));
      out.push({ file: join(dir, name), mtime: s.mtimeMs, size: s.size });
    } catch {
      /* vanished */
    }
  });
}

export type Listing = {
  transcripts: Transcript[];
  /** How many transcripts changed within the window, before the cap: what a complete look would have tracked. */
  found: number;
  /** The file cap or the directory budget cut the listing short: what is tracked is the newest part of what exists. */
  truncated: boolean;
};

/** Transcript files changed within `windowMs` of `now`, newest first, at most `maxFiles`. */
export async function listTranscripts(
  home: string,
  now: number,
  windowMs: number,
  maxFiles: number,
  entryBudget = MAX_ENTRIES,
): Promise<Listing> {
  const found: Transcript[] = [];
  let truncated = false;
  for (const provider of ['claude', 'codex'] as const) {
    const files: Found[] = [];
    const budget = { entries: entryBudget, spent: false };
    await walk(
      join(home, provider === 'claude' ? '.claude/projects' : '.codex/sessions'),
      [],
      0,
      files,
      now - windowMs,
      provider === 'codex',
      budget,
    );
    truncated ||= budget.spent;
    for (const f of files)
      if (now - f.mtime < windowMs)
        found.push({ provider, ...f, sessionKey: sessionKeyOf(provider, f.file) });
  }
  found.sort((a, b) => b.mtime - a.mtime);
  return {
    transcripts: found.slice(0, maxFiles),
    found: found.length,
    truncated: truncated || found.length > maxFiles,
  };
}

/** The repository folder a working directory belongs to, by name: a linked worktree is named after its repository. */
export function repoOfCwd(cwd: string): string {
  const linked = /^(.*?)\/\.(?:claude\/)?worktrees\//.exec(cwd);
  return basename(linked?.[1] ?? cwd) || 'unknown';
}

/** The session a Codex rollout was spawned by (its first line names the parent thread); null for any other transcript. */
export async function parentOf(t: Transcript): Promise<string | null> {
  if (t.provider !== 'codex') return null;
  try {
    return (await headOf('codex', t.file, t.size))?.meta?.spawn?.parent ?? null;
  } catch {
    return null;
  }
}

/** The repository folder of a transcript, from the directory its session started in; null when it names none. */
export async function repoOf(t: Transcript): Promise<string | null> {
  // A sub-agent's transcript says nothing of its own: it ran where its parent did.
  const main =
    t.provider === 'claude' && basename(dirname(t.file)) === 'subagents'
      ? `${dirname(dirname(t.file))}.jsonl`
      : t.file;
  try {
    const size = main === t.file ? t.size : (await stat(main)).size;
    const head = await headOf(t.provider, main, size);
    return head ? repoOfCwd(head.cwd) : null;
  } catch {
    return null;
  }
}
