import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { open, readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { assignProcesses, listAgentProcesses } from './agent-processes.js';
import { readHookState } from './hook-spool.js';
import { classifySession } from '@aether/kernel';
import { readClaudeTitle, readCodexTitles } from './session-title.js';
import { readTopic } from './session-topic.js';
import { readUsage } from './session-usage.js';
import type { AttributedSession, LocalSession } from '@aether/contracts';

// Read-only discovery of local Claude Code / Codex sessions. Metadata only: id, cwd, mtime.
// Transcript content is never retained or returned. Bounded by MAX_SESSIONS/MAX_REPOS.
const run = promisify(execFile);
export const MAX_SESSIONS = 60;
const MAX_REPOS = MAX_SESSIONS; // every session's directory is classified, none is left unowned by a cap
const GIT_BATCH = 10; // bounds concurrent git processes
const HEAD_BYTES = 64 * 1024;
// Bounds one scan of a provider's session tree, however large the history grows.
const MAX_SCAN_ENTRIES = 8 * 1024;
const RECENT_MS = 7 * 24 * 3600 * 1000;

type Child = { id: string; type: string; lastSeen: number };
type Raw = {
  provider: 'claude' | 'codex';
  sessionId: string;
  cwd: string;
  mtime: number;
  children?: Child[];
  file: string;
  shared?: boolean; // hosted by a long-running app server (Codex Desktop), not by its own process
};
const ACTIVE_CHILD_MS = 2 * 60 * 1000;

// A Codex rollout names its origin; a spawned one also carries its parent's thread id and its own role.
function codexMeta(text: string): {
  spawn: { parent: string; type: string } | null;
  shared: boolean;
} {
  try {
    const source = (JSON.parse(text.slice(0, text.indexOf('\n'))) as CodexMeta).payload?.source;
    const spawn = typeof source === 'object' ? source?.subagent?.thread_spawn : undefined;
    return {
      spawn: spawn?.parent_thread_id
        ? {
            parent: spawn.parent_thread_id,
            type: spawn.agent_role ?? spawn.agent_nickname ?? 'subagent',
          }
        : null,
      shared: typeof source === 'string' && source !== 'exec' && source !== 'cli',
    };
  } catch {
    return { spawn: null, shared: false }; // an oversized or cut first line is just an ordinary session
  }
}
type CodexMeta = {
  payload?: {
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

async function head(file: string): Promise<string> {
  const fh = await open(file, 'r');
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    return buf.toString('utf8', 0, bytesRead);
  } finally {
    await fh.close();
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

async function candidates(
  dir: string,
  depth: number,
  now: number,
  out: { file: string; mtime: number }[],
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
  for (const e of entries) {
    if (budget.entries-- <= 0) return;
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 4) await candidates(p, depth + 1, now, out, budget);
    // <session>/subagents/agent-*.jsonl are children of a session already listed, not sessions of their own.
    else if (e.isFile() && e.name.endsWith('.jsonl') && basename(dir) !== 'subagents') {
      try {
        const s = await stat(p);
        if (now - s.mtimeMs < RECENT_MS) out.push({ file: p, mtime: s.mtimeMs });
      } catch {
        /* vanished */
      }
    }
  }
}

export async function discoverRaw(home: string, now = Date.now()): Promise<Raw[]> {
  const found: (Raw & {
    spawn?: { parent: string; type: string } | null;
  })[] = [];
  for (const provider of ['claude', 'codex'] as const) {
    const list: { file: string; mtime: number }[] = [];
    await candidates(
      join(home, provider === 'claude' ? '.claude/projects' : '.codex/sessions'),
      0,
      now,
      list,
    );
    list.sort((a, b) => b.mtime - a.mtime);
    for (const { file, mtime } of list.slice(0, MAX_SESSIONS)) {
      try {
        const text = await head(file);
        const cwd = cwdOf(text);
        const base = file
          .split('/')
          .pop()!
          .replace(/\.jsonl$/, '');
        if (cwd)
          found.push({
            provider,
            sessionId:
              provider === 'codex'
                ? (/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.exec(base)?.[0] ?? base)
                : base,
            cwd,
            mtime,
            file,
            ...(provider === 'codex' ? codexMeta(text) : {}),
          });
      } catch {
        /* unreadable: skip, never fail the scan */
      }
    }
  }
  // A spawned Codex rollout is a subagent of its parent, shown as a character of the parent's project while it is active.
  const ids = new Set(found.map((r) => r.sessionId));
  const parents = new Map(found.map((r) => [r.sessionId, r]));
  const roots = found.filter((r) => !(r.spawn && ids.has(r.spawn.parent)));
  for (const r of found)
    if (r.spawn && ids.has(r.spawn.parent) && now - r.mtime < ACTIVE_CHILD_MS)
      (parents.get(r.spawn.parent)!.children ??= []).push({
        id: r.sessionId,
        type: r.spawn.type,
        lastSeen: Math.round(r.mtime),
      });
  return roots
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_SESSIONS)
    .map(({ spawn: _s, ...r }) => r);
}

export function parseGitStatus(text: string): NonNullable<LocalSession['git']> {
  const lines = text.split('\n').filter(Boolean);
  const header = lines.find((l) => l.startsWith('## ')) ?? '';
  const m =
    /^## (?:No commits yet on |Initial commit on )?([^.\s]+(?:\.[^.\s]+)*?)(?:\.\.\.(\S+))?(?: \[(.*)\])?$/.exec(
      header,
    );
  const flags = m?.[3] ?? '';
  return {
    branch: m?.[1] ?? null,
    upstream: m?.[2] ?? null,
    ahead: Number(/ahead (\d+)/.exec(flags)?.[1] ?? 0),
    behind: Number(/behind (\d+)/.exec(flags)?.[1] ?? 0),
    uncommitted: lines.filter((l) => !l.startsWith('## ')).length,
  };
}

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await run('git', ['-C', cwd, '-c', 'core.fsmonitor=false', ...args], {
    timeout: 4000,
    maxBuffer: 1024 * 1024,
    env: {
      PATH: process.env['PATH'] ?? '',
      GIT_OPTIONAL_LOCKS: '0',
      HOME: process.env['HOME'] ?? '',
    },
  });
  return stdout;
}

type RepoInfo = { git: LocalSession['git']; worktree: LocalSession['worktree'] };

async function repoInfo(cwd: string): Promise<RepoInfo> {
  const empty: RepoInfo = { git: null, worktree: null };
  try {
    if (!(await stat(cwd)).isDirectory()) return empty;
    const [status, ids] = await Promise.all([
      git(cwd, ['status', '--porcelain=v1', '-b', '--untracked-files=normal']),
      git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir', '--show-toplevel']),
    ]);
    const [common, root] = ids.trim().split('\n');
    if (!common || !root) return { ...empty, git: parseGitStatus(status) };
    const main = basename(common) === '.git' ? dirname(common) : common;
    return {
      git: parseGitStatus(status),
      worktree: { root, main, project: basename(main), linked: root !== main },
    };
  } catch {
    return empty;
  }
}

export const hookSpoolFile = () =>
  process.env['AETHER_HOOK_SPOOL'] ?? join(homedir(), '.aether', 'hook-events.jsonl');

let cache: { at: number; value: LocalSession[] } | null = null;
export async function scanLocalSessions(
  home: string,
  now = Date.now(),
  ttlMs = 5000,
  spoolFile = hookSpoolFile(),
): Promise<LocalSession[]> {
  if (cache && now - cache.at < ttlMs) return cache.value;
  const raw = await discoverRaw(home, now);
  const repos = [...new Set(raw.map((r) => r.cwd))].slice(0, MAX_REPOS);
  const infos: (readonly [string, RepoInfo])[] = [];
  for (let i = 0; i < repos.length; i += GIT_BATCH)
    infos.push(
      ...(await Promise.all(
        repos.slice(i, i + GIT_BATCH).map(async (c) => [c, await repoInfo(c)] as const),
      )),
    );
  const hooks = await readHookState(spoolFile, now);
  const live = await listAgentProcesses().catch(() => null); // no ps/lsof: say 'unknown', never 'none'
  const usages = new Map(
    await Promise.all(raw.map(async (r) => [r.file, await readUsage(r.provider, r.file)] as const)),
  );
  const codexTitles = await readCodexTitles(home);
  const titles = new Map(
    await Promise.all(
      raw.map(
        async (r) =>
          [
            r.file,
            r.provider === 'claude'
              ? await readClaudeTitle(r.file)
              : (codexTitles.get(r.sessionId) ?? null),
          ] as const,
      ),
    ),
  );
  const topics = new Map(
    await Promise.all(raw.map(async (r) => [r.file, await readTopic(r.provider, r.file)] as const)),
  );
  const running = live ? assignProcesses(raw, live.processes, live.desktopCodex) : null;
  const states = new Map(infos);
  const value = raw.map((r): LocalSession => {
    const key = `${r.provider}:${r.sessionId}`;
    const info = states.get(r.cwd);
    const hook = hooks.get(key);
    return {
      key,
      provider: r.provider,
      sessionId: r.sessionId,
      cwd: r.cwd,
      repo: info?.worktree?.project ?? basename(r.cwd),
      mtime: Math.round(r.mtime),
      git: info?.git ?? null,
      worktree: info?.worktree ?? null,
      hook: hook
        ? { activity: hook.activity, lastEvent: hook.lastEvent, tool: hook.tool, at: hook.at }
        : null,
      subagents: [...(hook?.subagents ?? []), ...(r.children ?? [])],
      title: titles.get(r.file) ?? null,
      classification: classifySession({
        title: titles.get(r.file) ?? null,
        prompt: topics.get(r.file) ?? null,
        branch: info?.git?.branch ?? null,
        repo: info?.worktree?.project ?? basename(r.cwd),
      }),
      usage: usages.get(r.file)!,
      process: running?.get(key) ?? 'unknown',
    };
  });
  cache = { at: now, value };
  return value;
}
export const resetLocalSessionCache = () => {
  cache = null;
};

const canonical = (path: string) => {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
};

// Claude Code names a project's scratch directory /tmp/claude-<uid>/<root with every non-alphanumeric as '-'>/…;
// agents launched there (for example headless Codex reviews) belong to that project even outside any repository.
const encodeRoot = (root: string) => root.replace(/[^A-Za-z0-9]/g, '-');
const scratchOwner = /^(?:\/private)?\/tmp\/claude-\d+\/([^/]+)\//;

/** Joins each session to the project whose root is its main checkout, so worktrees share one project. */
export function attributeSessions(
  sessions: readonly LocalSession[],
  projects: readonly { id: string; root: string | null }[],
): AttributedSession[] {
  const roots = projects.flatMap((p) => (p.root ? [{ id: p.id, root: canonical(p.root) }] : []));
  const byRoot = new Map(roots.map((p) => [p.root, p.id]));
  const byScratch = new Map(roots.map((p) => [encodeRoot(p.root), p.id]));
  return sessions.map((s) => ({
    ...s,
    projectId: s.worktree
      ? (byRoot.get(canonical(s.worktree.main)) ?? null)
      : (byScratch.get(scratchOwner.exec(s.cwd)?.[1] ?? '') ?? null),
  }));
}
