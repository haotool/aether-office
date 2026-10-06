import { readdir, stat } from 'node:fs/promises';
import { basename, isAbsolute, join } from 'node:path';
import type { Subagent } from '@aether/contracts';
import { FINISHED_GRACE_MS } from './hook-spool.js';
import type { AgentProcess } from './agent-processes.js';
import { readEdge } from './file-edge.js';
import { mapPool } from './pool.js';

// Read-only discovery of local Claude Code / Codex session files: id, cwd, mtime. Transcript content is never kept.
const HEAD_BYTES = 64 * 1024;
const HEAD_WIDTH = 12; // heads read at once, the first time a file is seen
const STAT_WIDTH = 16;
// Bounds one walk of a provider's session tree, however large the history grows.
const MAX_SCAN_ENTRIES = 8 * 1024;
// How many recent files are identified at all. Every one is, because a live process may own any of them: what is shown
// is chosen later (local-sessions.ts), after it is known which sessions have a process.
const MAX_CANDIDATES = 2000;
const RECENT_MS = 7 * 24 * 3600 * 1000;
export const ACTIVE_CHILD_MS = 2 * 60 * 1000;
const NICKNAME_CHARS = 40;
export const UUID_SUFFIX = /[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

export type Raw = {
  provider: 'claude' | 'codex';
  sessionId: string;
  cwd: string;
  mtime: number;
  children?: Subagent[];
  file: string;
  shared?: boolean; // hosted by a long-running app server (Codex Desktop), not by its own process
};
type Candidate = { file: string; mtime: number; size: number };
type Spawn = { parent: string; type: string; nickname: string | null; startedAt: number | null };
type CodexMeta = {
  timestamp?: string;
  payload?: {
    timestamp?: string;
    source?:
      | string
      | {
          subagent?: {
            thread_spawn?: {
              parent_thread_id?: string;
              agent_role?: string;
              agent_nickname?: string;
            };
          };
        };
  };
};

/** Claude Code names a project's folder after its directory, every character but letters and digits a dash. */
export const encodeRoot = (root: string) => root.replace(/[^A-Za-z0-9]/g, '-');

// A Codex rollout names its origin; a spawned one also carries its parent's thread id and its own role.
function codexMeta(text: string): {
  spawn: Spawn | null;
  shared: boolean;
} {
  try {
    const meta = JSON.parse(text.slice(0, text.indexOf('\n'))) as CodexMeta;
    const source = meta.payload?.source;
    const started = Date.parse(meta.payload?.timestamp ?? meta.timestamp ?? '');
    const spawn = typeof source === 'object' ? source?.subagent?.thread_spawn : undefined;
    return {
      spawn: spawn?.parent_thread_id
        ? {
            parent: spawn.parent_thread_id,
            type: spawn.agent_role ?? spawn.agent_nickname ?? 'subagent',
            nickname: spawn.agent_nickname?.slice(0, NICKNAME_CHARS) ?? null,
            startedAt: Number.isFinite(started) ? started : null,
          }
        : null,
      shared: typeof source === 'string' && source !== 'exec' && source !== 'cli',
    };
  } catch {
    return { spawn: null, shared: false }; // an oversized or cut first line is just an ordinary session
  }
}

const cwdOf = (text: string) => {
  const m = /"cwd":"((?:[^"\\]|\\.)*)"/.exec(text);
  if (!m) return null;
  try {
    const v = JSON.parse(`"${m[1]}"`) as string;
    return isAbsolute(v) ? v : null;
  } catch {
    return null;
  }
};

export type Head = {
  cwd: string;
  sessionId: string;
  meta: ReturnType<typeof codexMeta> | null;
};
// A session's directory and id are fixed by its first lines, so each file is read once, ever. A file with no
// directory yet is asked again when it has grown.
const heads = new Map<string, { size: number; head: Head | null }>();
const MAX_HEADS = 4096;

export async function headOf(
  provider: Raw['provider'],
  file: string,
  size: number,
): Promise<Head | null> {
  const known = heads.get(file);
  if (known && (known.head || known.size === size)) return known.head;
  let head: Head | null = null;
  try {
    const text = await readEdge(file, 'head', HEAD_BYTES);
    const cwd = cwdOf(text);
    const base = basename(file).replace(/\.jsonl$/, '');
    if (cwd)
      head = {
        cwd,
        sessionId: provider === 'codex' ? (UUID_SUFFIX.exec(base)?.[0] ?? base) : base,
        meta: provider === 'codex' ? codexMeta(text) : null,
      };
  } catch {
    return null; // unreadable: skip, never fail the scan
  }
  if (heads.size >= MAX_HEADS) heads.clear();
  heads.set(file, { size, head });
  return head;
}

export const resetDiscoveryCache = () => heads.clear();

async function candidates(
  dir: string,
  depth: number,
  now: number,
  out: Candidate[],
  budget = { entries: MAX_SCAN_ENTRIES },
) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  // Newest first (Codex shards by YYYY/MM/DD), so a spent budget drops the oldest sessions, not the latest.
  entries.sort((a, b) => (a.name < b.name ? 1 : -1));
  const files: string[] = [];
  for (const e of entries) {
    if (budget.entries-- <= 0) break;
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 4) await candidates(p, depth + 1, now, out, budget);
    // <session>/subagents/agent-*.jsonl are children of a session already listed, not sessions of their own.
    else if (e.isFile() && e.name.endsWith('.jsonl') && basename(dir) !== 'subagents')
      files.push(p);
  }
  await mapPool(files, STAT_WIDTH, async (p) => {
    try {
      const s = await stat(p);
      if (now - s.mtimeMs < RECENT_MS) out.push({ file: p, mtime: s.mtimeMs, size: s.size });
    } catch {
      /* vanished */
    }
  });
}

async function rawOf(provider: Raw['provider'], c: Candidate) {
  const head = await headOf(provider, c.file, c.size);
  if (!head) return null;
  return {
    provider,
    sessionId: head.sessionId,
    cwd: head.cwd,
    mtime: c.mtime,
    file: c.file,
    ...(head.meta ?? {}),
  };
}

/** Every session file changed in the last week, identified. Which of them are shown is decided by the caller. */
export async function discoverRaw(home: string, now = Date.now()): Promise<Raw[]> {
  const found: (Raw & {
    spawn?: Spawn | null;
  })[] = [];
  for (const provider of ['claude', 'codex'] as const) {
    const list: Candidate[] = [];
    await candidates(
      join(home, provider === 'claude' ? '.claude/projects' : '.codex/sessions'),
      0,
      now,
      list,
    );
    // Files stat'ed in parallel finish in any order: equal mtimes (a copied or extracted folder) tie-break on the path, so the
    // sessions, and the desks the office seats them at, keep their order from one scan to the next.
    list.sort((a, b) => b.mtime - a.mtime || (a.file < b.file ? -1 : 1));
    const read = await mapPool(list.slice(0, MAX_CANDIDATES), HEAD_WIDTH, (c) =>
      rawOf(provider, c),
    );
    for (const r of read) if (r) found.push(r);
  }
  // A spawned Codex rollout is a subagent of its parent, shown as a character of the parent's project while it is active.
  const ids = new Set(found.map((r) => r.sessionId));
  const parents = new Map(found.map((r) => [r.sessionId, r]));
  const roots = found.filter((r) => !(r.spawn && ids.has(r.spawn.parent)));
  // A rollout that has not been written for ACTIVE_CHILD_MS is finished; it stays for the grace period, then goes.
  for (const r of found) {
    if (!r.spawn || !ids.has(r.spawn.parent)) continue;
    const quiet = now - r.mtime;
    if (quiet >= ACTIVE_CHILD_MS + FINISHED_GRACE_MS) continue;
    const finished = quiet >= ACTIVE_CHILD_MS;
    (parents.get(r.spawn.parent)!.children ??= []).push({
      id: r.sessionId,
      type: r.spawn.type,
      lastSeen: Math.round(r.mtime),
      source: 'rollout',
      status: finished ? 'finished' : 'running',
      startedAt: r.spawn.startedAt,
      endedAt: finished ? Math.round(r.mtime) : null,
      nickname: r.spawn.nickname,
      tools: null,
      label: null,
      tokens: null,
      result: null,
    });
  }
  return roots.sort((a, b) => b.mtime - a.mtime).map(({ spawn: _s, ...r }) => r);
}

/**
 * Sessions older than the recent window (or lost to a read error) that a live process still owns. A process alive for
 * days in a quiet transcript is exactly the one worth finding, and its file is looked up from the process itself:
 * a Claude process by its resume id, or the newest files of its directory's own project folder; a Codex process by
 * the id in its rollout's name.
 */
export async function sessionsOfProcesses(
  home: string,
  lost: readonly AgentProcess[],
  have: ReadonlySet<string>,
): Promise<Raw[]> {
  const found: Raw[] = [];
  const taken = new Set(have);
  const add = async (provider: Raw['provider'], file: string) => {
    if (taken.has(file)) return;
    try {
      const s = await stat(file);
      const r = await rawOf(provider, { file, mtime: s.mtimeMs, size: s.size });
      if (r) {
        taken.add(file);
        found.push(r);
      }
    } catch {
      /* gone */
    }
  };
  const projects = join(home, '.claude/projects');
  const claude = lost.filter((p) => p.provider === 'claude');
  // Named by --resume: the file is `<id>.jsonl` in whichever project folder it began in.
  const named = claude.filter((p) => p.resume);
  if (named.length) {
    const folders = await readdir(projects).catch(() => [] as string[]);
    for (const p of named)
      for (const folder of folders)
        await add('claude', join(projects, folder, `${p.resume}.jsonl`));
  }
  // Not named: the N processes of a directory own the N newest files of that directory's project folder.
  const byDirectory = new Map<string, number>();
  for (const p of claude.filter((p) => !p.resume))
    byDirectory.set(p.cwd, (byDirectory.get(p.cwd) ?? 0) + 1);
  for (const [cwd, count] of byDirectory) {
    const folder = join(projects, encodeRoot(cwd));
    const names = (await readdir(folder).catch(() => [] as string[])).filter((n) =>
      n.endsWith('.jsonl'),
    );
    const dated = await mapPool(names, STAT_WIDTH, async (name) => ({
      file: join(folder, name),
      mtime: (await stat(join(folder, name)).catch(() => null))?.mtimeMs ?? 0,
    }));
    let wanted = count; // as many more files as there are processes without one
    for (const { file } of dated.sort((a, b) => b.mtime - a.mtime)) {
      if (wanted <= 0) break;
      if (taken.has(file)) continue;
      const before = found.length;
      await add('claude', file);
      if (found.length > before) wanted--;
    }
  }
  const codexIds = new Set(
    lost.flatMap((p) => (p.provider === 'codex' && p.resume ? [p.resume] : [])),
  );
  if (codexIds.size) {
    const walk = async (dir: string, depth: number): Promise<void> => {
      for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
        const p = join(dir, e.name);
        if (e.isDirectory() && depth < 4) await walk(p, depth + 1);
        else if (e.isFile() && [...codexIds].some((id) => e.name.endsWith(`${id}.jsonl`)))
          await add('codex', p);
      }
    };
    await walk(join(home, '.codex/sessions'), 0);
  }
  return found;
}
