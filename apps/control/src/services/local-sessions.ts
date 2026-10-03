import { execFile } from 'node:child_process';
import { homedir } from 'node:os';
import { promisify } from 'node:util';
import { open, readdir, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import { readHookState } from './hook-spool.js';
import type { LocalSession } from '@aether/contracts';

// Read-only discovery of local Claude Code / Codex sessions. Metadata only: id, cwd, mtime.
// Transcript content is never retained or returned. Bounded by MAX_SESSIONS/MAX_REPOS.
const run = promisify(execFile);
export const MAX_SESSIONS = 60;
const MAX_REPOS = 30;
const HEAD_BYTES = 64 * 1024;
const RECENT_MS = 7 * 24 * 3600 * 1000;

type Raw = { provider: 'claude' | 'codex'; sessionId: string; cwd: string; mtime: number };

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
) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.isSymbolicLink()) continue;
    const p = join(dir, e.name);
    if (e.isDirectory() && depth < 4) await candidates(p, depth + 1, now, out);
    else if (e.isFile() && e.name.endsWith('.jsonl')) {
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
  const found: (Raw & { file: string })[] = [];
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
        const cwd = cwdOf(await head(file));
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
          });
      } catch {
        /* unreadable: skip, never fail the scan */
      }
    }
  }
  return found
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, MAX_SESSIONS)
    .map(({ file: _f, ...r }) => r);
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
      worktree: { root, project: basename(main), linked: root !== main },
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
  const [infos, hooks] = await Promise.all([
    Promise.all(repos.map(async (c) => [c, await repoInfo(c)] as const)),
    readHookState(spoolFile, now),
  ]);
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
      hook: hook ? { activity: hook.activity, lastEvent: hook.lastEvent, at: hook.at } : null,
      subagents: hook?.subagents ?? [],
    };
  });
  cache = { at: now, value };
  return value;
}
export const resetLocalSessionCache = () => {
  cache = null;
};
