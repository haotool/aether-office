import type { Dirent, Stats } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { UUID_SUFFIX, headOf } from '../sessions/session-discovery.js';
import { mapPool } from '../runtime/pool.js';

const MAX_ENTRIES = 24 * 1024;
const STAT_WIDTH = 16;
const DAY_MS = 86_400_000;

export type Transcript = {
  provider: 'claude' | 'codex';
  file: string;
  mtime: number;
  size: number;
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

function olderThanWindow(parts: readonly string[], cutoff: number): boolean {
  if (parts.length !== 3) return false;
  const [y, m, d] = parts.map(Number) as [number, number, number];
  return Number.isFinite(Date.UTC(y, m - 1, d)) && Date.UTC(y, m - 1, d) + 2 * DAY_MS < cutoff;
}

type Found = { file: string; mtime: number; size: number };
type Budget = { entries: number; spent: boolean };

async function orderNewestFirst(dir: string, entries: Dirent[], codex: boolean) {
  const stats = new Map<string, Stats>();
  if (codex) entries.sort((a, b) => (a.name < b.name ? 1 : -1));
  else {
    await mapPool(entries, STAT_WIDTH, async (e) => {
      if (!e.isSymbolicLink())
        await stat(join(dir, e.name))
          .then((s) => stats.set(e.name, s))
          .catch(() => undefined);
    });
    const at = (name: string) => stats.get(name)?.mtimeMs ?? 0;
    entries.sort((a, b) => at(b.name) - at(a.name));
  }
  return stats;
}

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
  const stats = await orderNewestFirst(dir, entries, codex);
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

type Listing = {
  transcripts: Transcript[];
  found: number;
  truncated: boolean;
};

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

function repoOfCwd(cwd: string): string {
  const linked = /^(.*?)\/\.(?:claude\/)?worktrees\//.exec(cwd);
  return basename(linked?.[1] ?? cwd) || 'unknown';
}

export async function parentOf(t: Transcript): Promise<string | null> {
  if (t.provider !== 'codex') return null;
  try {
    return (await headOf('codex', t.file, t.size))?.meta?.spawn?.parent ?? null;
  } catch {
    return null;
  }
}

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
