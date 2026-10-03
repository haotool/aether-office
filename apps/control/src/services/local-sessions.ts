import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { open, readdir, stat } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { z } from 'zod';

// Read-only discovery of local Claude Code / Codex sessions. Metadata only: id, cwd, mtime.
// Transcript content is never retained or returned. Bounded by MAX_SESSIONS/MAX_REPOS.
const run = promisify(execFile);
export const MAX_SESSIONS = 60;
const MAX_REPOS = 30;
const HEAD_BYTES = 64 * 1024;
const RECENT_MS = 7 * 24 * 3600 * 1000;

export const localSessionSchema = z.object({
  key: z.string(),
  provider: z.enum(['claude', 'codex']),
  sessionId: z.string(),
  cwd: z.string(),
  repo: z.string(),
  mtime: z.number(),
  git: z
    .object({
      branch: z.string().nullable(),
      upstream: z.string().nullable(),
      ahead: z.number(),
      behind: z.number(),
      uncommitted: z.number(),
    })
    .nullable(),
});
export type LocalSession = z.infer<typeof localSessionSchema>;
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

async function gitState(cwd: string): Promise<LocalSession['git']> {
  try {
    if (!(await stat(cwd)).isDirectory()) return null;
    const { stdout } = await run(
      'git',
      [
        '-C',
        cwd,
        '-c',
        'core.fsmonitor=false',
        'status',
        '--porcelain=v1',
        '-b',
        '--untracked-files=normal',
      ],
      {
        timeout: 4000,
        maxBuffer: 1024 * 1024,
        env: {
          PATH: process.env['PATH'] ?? '',
          GIT_OPTIONAL_LOCKS: '0',
          HOME: process.env['HOME'] ?? '',
        },
      },
    );
    return parseGitStatus(stdout);
  } catch {
    return null;
  }
}

let cache: { at: number; value: LocalSession[] } | null = null;
export async function scanLocalSessions(
  home: string,
  now = Date.now(),
  ttlMs = 5000,
): Promise<LocalSession[]> {
  if (cache && now - cache.at < ttlMs) return cache.value;
  const raw = await discoverRaw(home, now);
  const repos = [...new Set(raw.map((r) => r.cwd))].slice(0, MAX_REPOS);
  const states = new Map(
    await Promise.all(repos.map(async (c) => [c, await gitState(c)] as const)),
  );
  const value = raw.map((r) => ({
    key: `${r.provider}:${r.sessionId}`,
    provider: r.provider,
    sessionId: r.sessionId,
    cwd: r.cwd,
    repo: r.cwd.split('/').filter(Boolean).pop() ?? r.cwd,
    mtime: Math.round(r.mtime),
    git: states.get(r.cwd) ?? null,
  }));
  cache = { at: now, value };
  return value;
}
export const resetLocalSessionCache = () => {
  cache = null;
};
