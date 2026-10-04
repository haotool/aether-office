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
  /** From `ps`: share of one core, and resident memory. What pidusage reads on macOS too, without the dependency. */
  cpuPercent: number;
  rssBytes: number;
  /** TCP ports the agent or anything it started (a dev server) is listening on. */
  ports: number[];
};
export type ProcessState = LocalSession['process'];

// Helpers and servers that merely carry the provider's name never hold a session of their own.
const NOT_A_SESSION = /\b(app-server|exec-server|code-mode-host|mcp-server|--version)\b/;
const RESUME = /(?:--resume|-r)[ =]([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i;

/** Pure: which providers' CLI processes does this `ps -o pid=,%cpu=,rss=,command=` listing contain? */
export function parseProcessList(text: string): Omit<AgentProcess, 'cwd' | 'ports'>[] {
  return text.split('\n').flatMap((line) => {
    const m = /^\s*(\d+)\s+([\d.]+)\s+(\d+)\s+(.+)$/.exec(line);
    if (!m) return [];
    const [, pid, cpu, rss, command] = m as unknown as [string, string, string, string, string];
    const program = basename(command.split(/\s+-/)[0]!.trim().split(' ')[0] ?? '');
    const provider = program === 'claude' ? 'claude' : program === 'codex' ? 'codex' : null;
    if (!provider || NOT_A_SESSION.test(command)) return [];
    return [
      {
        pid: Number(pid),
        provider,
        resume: RESUME.exec(command)?.[1] ?? null,
        cpuPercent: Number(cpu),
        rssBytes: Number(rss) * 1024,
      },
    ];
  });
}

/** Pure: every descendant of each root, from `ps -o pid=,ppid=` lines. */
export function descendants(text: string, roots: readonly number[]): Map<number, number> {
  const children = new Map<number, number[]>();
  for (const line of text.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)/.exec(line);
    if (!m) continue;
    const [pid, ppid] = [Number(m[1]), Number(m[2])];
    children.set(ppid, [...(children.get(ppid) ?? []), pid]);
  }
  const owner = new Map<number, number>(); // pid → the root it descends from
  for (const root of roots) {
    const queue = [root];
    while (queue.length) {
      const pid = queue.pop()!;
      if (owner.has(pid)) continue;
      owner.set(pid, root);
      queue.push(...(children.get(pid) ?? []));
    }
  }
  return owner;
}

/** Pure: `lsof -Fpn -iTCP -sTCP:LISTEN` output → pid → listening ports. */
export function parseListening(text: string): Map<number, number[]> {
  const found = new Map<number, number[]>();
  let pid = 0;
  for (const line of text.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid) {
      const port = Number(/:(\d+)$/.exec(line)?.[1]);
      if (port && !(found.get(pid) ?? []).includes(port))
        found.set(pid, [...(found.get(pid) ?? []), port]);
    }
  }
  return found;
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

/** Ports each agent's process tree listens on (best effort: none when ps or lsof is unavailable). */
async function listeningPorts(roots: number[]): Promise<Map<number, number[]>> {
  if (!roots.length || process.platform === 'win32') return new Map();
  try {
    const tree = descendants(
      (await run('ps', ['-axo', 'pid=,ppid='], { timeout: 4000, maxBuffer: 4 * 1024 * 1024 }))
        .stdout,
      roots,
    );
    const out = await run(
      'lsof',
      ['-nP', '-iTCP', '-sTCP:LISTEN', '-Fpn', '-a', '-p', [...tree.keys()].join(',')],
      {
        timeout: 4000,
        maxBuffer: 1024 * 1024,
      },
    ).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? '' }));
    const byRoot = new Map<number, number[]>();
    for (const [pid, list] of parseListening(out.stdout)) {
      const root = tree.get(pid)!;
      byRoot.set(
        root,
        [...new Set([...(byRoot.get(root) ?? []), ...list])].sort((a, b) => a - b),
      );
    }
    return byRoot;
  } catch {
    return new Map();
  }
}

export async function listAgentProcesses(): Promise<{
  processes: AgentProcess[];
  desktopCodex: boolean;
}> {
  const { stdout } = await run('ps', ['-axo', 'pid=,%cpu=,rss=,command='], {
    timeout: 4000,
    maxBuffer: 4 * 1024 * 1024,
  });
  const candidates = parseProcessList(stdout);
  const cwds = await cwdsOf(candidates.map((c) => c.pid));
  const ports = await listeningPorts(candidates.map((c) => c.pid));
  const processes = candidates.flatMap((c) => {
    const cwd = cwds.get(c.pid);
    return cwd ? [{ ...c, cwd, ports: ports.get(c.pid) ?? [] }] : [];
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
): Map<string, { state: ProcessState; process: AgentProcess | null }> {
  const states = new Map<string, { state: ProcessState; process: AgentProcess | null }>();
  const keyOf = (s: Located) => `${s.provider}:${s.sessionId}`;
  const named = new Map<string, AgentProcess>(
    processes.flatMap((p) => (p.resume ? [[`${p.provider}:${p.resume}`, p] as const] : [])),
  );
  const anonymous = new Map<string, AgentProcess[]>();
  for (const p of processes)
    if (!p.resume)
      anonymous.set(`${p.provider}\0${p.cwd}`, [
        ...(anonymous.get(`${p.provider}\0${p.cwd}`) ?? []),
        p,
      ]);
  for (const s of [...sessions].sort((a, b) => b.mtime - a.mtime)) {
    const key = keyOf(s);
    const free = anonymous.get(`${s.provider}\0${s.cwd}`) ?? [];
    const owned = named.get(key) ?? free.shift() ?? null;
    states.set(
      key,
      owned
        ? { state: 'running', process: owned }
        : { state: s.shared && desktopCodex ? 'unknown' : 'none', process: null },
    );
  }
  return states;
}
