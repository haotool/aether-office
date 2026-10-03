import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import type { LocalSession } from '@aether/contracts';

const run = promisify(execFile);
export type AgentProcess = {
  pid: number;
  provider: 'claude' | 'codex';
  cwd: string;
  resume: string | null;
};
export type ProcessState = LocalSession['process'];

// Helpers and servers that merely carry the provider's name never hold a session of their own.
const NOT_A_SESSION = /\b(app-server|exec-server|code-mode-host|mcp-server|--version)\b/;
const RESUME = /(?:--resume|-r)[ =]([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i;

/** Pure: which providers' CLI processes does this `ps` listing (pid, command) contain? */
export function parseProcessList(
  text: string,
): { pid: number; provider: 'claude' | 'codex'; resume: string | null }[] {
  return text.split('\n').flatMap((line) => {
    const m = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!m) return [];
    const [, pid, command] = m as unknown as [string, string, string];
    const program = basename(command.split(/\s+-/)[0]!.trim().split(' ')[0] ?? '');
    const provider = program === 'claude' ? 'claude' : program === 'codex' ? 'codex' : null;
    if (!provider || NOT_A_SESSION.test(command)) return [];
    return [{ pid: Number(pid), provider, resume: RESUME.exec(command)?.[1] ?? null }];
  });
}

/** Pure: `lsof -Fpn` output for `-d cwd` → pid → directory. */
export function parseCwds(text: string): Map<number, string> {
  const found = new Map<number, string>();
  let pid = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid) found.set(pid, line.slice(1));
  }
  return found;
}

async function cwdsOf(pids: number[]): Promise<Map<number, string>> {
  if (!pids.length) return new Map();
  if (process.platform === 'linux') {
    const entries = await Promise.all(
      pids.map(async (pid) => [pid, await readlink(`/proc/${pid}/cwd`).catch(() => '')] as const),
    );
    return new Map(entries.filter(([, cwd]) => cwd));
  }
  const out = await run('lsof', ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')], {
    timeout: 4000,
    maxBuffer: 1024 * 1024,
  }).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? '' })); // lsof exits 1 when some pid vanished
  return parseCwds(out.stdout);
}

export async function listAgentProcesses(): Promise<{
  processes: AgentProcess[];
  desktopCodex: boolean;
}> {
  const { stdout } = await run('ps', ['-axo', 'pid=,command='], {
    timeout: 4000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const candidates = parseProcessList(stdout);
  const cwds = await cwdsOf(candidates.map((c) => c.pid));
  const processes = candidates.flatMap((c) => {
    const cwd = cwds.get(c.pid);
    return cwd ? [{ ...c, cwd }] : [];
  });
  return { processes, desktopCodex: /\bcodex\b[^\n]* app-server\b/.test(stdout) };
}

type Located = Pick<LocalSession, 'provider' | 'sessionId' | 'cwd' | 'mtime'> & {
  shared?: boolean;
};

/**
 * Pure. A process names its session with --resume; otherwise the N processes of a provider in a directory
 * belong to that directory's N most recently written sessions. A Codex Desktop thread (`shared`) lives inside
 * one long-running app server whose own directory says nothing about it, so it is 'unknown', not 'none'.
 */
export function assignProcesses(
  sessions: readonly Located[],
  processes: readonly AgentProcess[],
  desktopCodex: boolean,
): Map<string, ProcessState> {
  const states = new Map<string, ProcessState>();
  const keyOf = (s: Located) => `${s.provider}:${s.sessionId}`;
  const named = new Set(processes.flatMap((p) => (p.resume ? [`${p.provider}:${p.resume}`] : [])));
  const anonymous = new Map<string, number>();
  for (const p of processes)
    if (!p.resume)
      anonymous.set(`${p.provider}\0${p.cwd}`, (anonymous.get(`${p.provider}\0${p.cwd}`) ?? 0) + 1);
  for (const s of [...sessions].sort((a, b) => b.mtime - a.mtime)) {
    const key = keyOf(s);
    const slot = `${s.provider}\0${s.cwd}`;
    const free = anonymous.get(slot) ?? 0;
    if (named.has(key)) states.set(key, 'running');
    else if (free > 0) {
      anonymous.set(slot, free - 1);
      states.set(key, 'running');
    } else states.set(key, s.shared && desktopCodex ? 'unknown' : 'none');
  }
  return states;
}
