import { execFile } from 'node:child_process';
import { readlink } from 'node:fs/promises';
import { basename } from 'node:path';
import { promisify } from 'node:util';
import type { LocalSession } from '@aether/contracts';

const run = promisify(execFile);
export type AgentProcess = {
  pid: number;
  ppid: number;
  provider: 'claude' | 'codex';
  cwd: string;
  resume: string | null;
  /** From `ps`: share of one core, and resident memory. What pidusage reads on macOS too, without the dependency. */
  cpuPercent: number;
  rssBytes: number;
  /** When the process started (ps `lstart`, to the second): with the pid, the identity of this process and no other. */
  startedAt: number;
  /** CPU time the process has used in all; its growth between two looks says whether it is doing anything. */
  cpuSeconds: number;
  /** `ps` state of the process itself, e.g. `S+`, `Ss`. */
  stat: string;
  /**
   * Zombies under it: finished processes nobody has collected (`<defunct>`, state Z). A zombie keeps no name, no
   * arguments and no directory, so it cannot be traced to a session by itself; it belongs to whoever should have
   * collected it, which is the process it descends from.
   */
  zombies: Zombie[];
  /** Has the process lost the one that started it? (see isOrphaned) */
  orphaned: boolean;
  /** TCP ports the agent or anything it started (a dev server) is listening on. */
  ports: number[];
};
export type ProcessState = LocalSession['process'];
/** A finished process nobody collected, and the program it was when it was last seen alive (null if it never was). */
export type Zombie = { pid: number; startedAt: number; program: string | null };

/** One line of `ps`, for any process: the table the parent and tree questions are answered from. */
export type ProcessRow = {
  pid: number;
  ppid: number;
  stat: string;
  startedAt: number;
  cpuSeconds: number;
  cpuPercent: number;
  rssBytes: number;
  tty: string;
  command: string;
};

// Helpers and servers that merely carry the provider's name never hold a session of their own.
const NOT_A_SESSION = /\b(app-server|exec-server|code-mode-host|mcp-server|--version)\b/;
// The manager that adopts a user's orphans on Linux, in place of init.
const ORPHAN_ADOPTER = /(?:^|\/)systemd\s.*--user\b/;
const RESUME = /(?:--resume|-r)[ =]([0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})/i;
// `ps -o lstart` is always 24 characters ("Sat Oct  3 10:23:45 2026") and, run with LC_ALL=C, always in English.
const LSTART = /^(?:\w{3}) (\w{3}) +(\d{1,2}) (\d\d):(\d\d):(\d\d) (\d{4})/;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const PS_FORMAT = 'lstart=,pid=,ppid=,stat=,time=,%cpu=,rss=,tty=,command=';

/** Pure. `ps` start time (local time, to the second) → epoch milliseconds, or null when it does not parse. */
export function parseStartTime(text: string): number | null {
  const m = LSTART.exec(text.trim());
  if (!m) return null;
  const month = MONTHS.indexOf(m[1]!);
  if (month < 0) return null;
  return new Date(
    Number(m[6]),
    month,
    Number(m[2]),
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
  ).getTime();
}

/** Pure. CPU time as `ps` prints it (`[dd-][hh:]mm:ss[.cc]`) → seconds. */
export function parseCpuTime(text: string): number {
  const [days, clock] = text.includes('-') ? text.split('-') : ['0', text];
  const parts = clock!.split(':').map(Number);
  if (parts.some((n) => !Number.isFinite(n))) return 0;
  return parts.reduce((total, n) => total * 60 + n, 0) + Number(days) * 86400;
}

/** Pure. Every line of `ps -axo ${PS_FORMAT}`. */
export function parseProcessTable(text: string): ProcessRow[] {
  return text.split('\n').flatMap((line) => {
    const startedAt = parseStartTime(line.slice(0, 24));
    const m = /^\s*(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+([\d.]+)\s+(\d+)\s+(\S+)\s+(.+)$/.exec(
      line.slice(24),
    );
    if (startedAt === null || !m) return [];
    const [, pid, ppid, stat, time, cpu, rss, tty, command] = m as unknown as string[] as [
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
      string,
    ];
    return [
      {
        pid: Number(pid),
        ppid: Number(ppid),
        stat,
        startedAt,
        cpuSeconds: parseCpuTime(time),
        cpuPercent: Number(cpu),
        rssBytes: Number(rss) * 1024,
        tty,
        command,
      },
    ];
  });
}

/** Pure. The provider CLI processes among `rows`: the sessions' own, not helpers that share the name. */
export function parseProcessList(
  rows: readonly ProcessRow[],
): Omit<AgentProcess, 'cwd' | 'ports' | 'orphaned' | 'zombies'>[] {
  return rows.flatMap((row) => {
    const program = basename(row.command.split(/\s+-/)[0]!.trim().split(' ')[0] ?? '');
    const provider = program === 'claude' ? 'claude' : program === 'codex' ? 'codex' : null;
    if (!provider || NOT_A_SESSION.test(row.command)) return [];
    return [
      {
        pid: row.pid,
        ppid: row.ppid,
        provider,
        resume: RESUME.exec(row.command)?.[1] ?? null,
        cpuPercent: row.cpuPercent,
        rssBytes: row.rssBytes,
        startedAt: row.startedAt,
        cpuSeconds: row.cpuSeconds,
        stat: row.stat,
      },
    ];
  });
}

/**
 * Pure. Has this process lost the one that started it? Not simply `ppid <= 1`: under a `systemd --user` manager (and in
 * a container with a subreaper) an orphan is adopted by that manager, whose pid is large and alive, so the test is
 * "the parent is gone, init, or a manager that adopts orphans" (gascity learned this the hard way). A zombie is never
 * called an orphan: nothing is running to be lost.
 */
export function isOrphaned(
  row: Pick<ProcessRow, 'ppid' | 'stat'>,
  byPid: ReadonlyMap<number, ProcessRow>,
): boolean {
  if (row.stat.startsWith('Z')) return false;
  if (row.ppid <= 1) return true;
  const parent = byPid.get(row.ppid);
  return !parent || ORPHAN_ADOPTER.test(parent.command);
}

/**
 * Remembers what the processes under the agents were called while they were alive. A zombie loses its name, so the only
 * way to say what it was is to have looked before it died. Only the program (no arguments: those can hold secrets), only
 * for processes under an agent, and only as long as they exist.
 */
export class ProcessNames {
  private seen = new Map<string, string>();
  private key = (row: Pick<ProcessRow, 'pid' | 'startedAt'>) => `${row.pid}:${row.startedAt}`;

  /** Looks at the table once: names the living `watched` rows, keeps the names of the zombies among them. */
  remember(rows: readonly ProcessRow[], watched: ReadonlySet<number>): void {
    const next = new Map<string, string>();
    for (const row of rows) {
      if (!watched.has(row.pid)) continue;
      const name = row.stat.startsWith('Z')
        ? this.seen.get(this.key(row))
        : basename(row.command.trim().split(/\s+/)[0] ?? '').slice(0, 40);
      if (name) next.set(this.key(row), name);
    }
    this.seen = next;
  }

  programOf(row: Pick<ProcessRow, 'pid' | 'startedAt'>): string | null {
    return this.seen.get(this.key(row)) ?? null;
  }
}

/** Pure: the zombies (state Z) that descend from each root, counted under the process that fathered them. */
export function zombiesUnder(
  rows: readonly ProcessRow[],
  roots: readonly number[],
  names: Pick<ProcessNames, 'programOf'> = { programOf: () => null },
): Map<number, Zombie[]> {
  const owner = descendants(rows, roots);
  const found = new Map<number, Zombie[]>();
  for (const row of rows) {
    const root = row.stat.startsWith('Z') ? owner.get(row.pid) : undefined;
    if (root === undefined || root === row.pid) continue;
    found.set(root, [
      ...(found.get(root) ?? []),
      { pid: row.pid, startedAt: row.startedAt, program: names.programOf(row) },
    ]);
  }
  return found;
}

/** Pure: every descendant of each root, from the process table. */
export function descendants(
  rows: readonly ProcessRow[],
  roots: readonly number[],
): Map<number, number> {
  const children = new Map<number, number[]>();
  for (const row of rows) children.set(row.ppid, [...(children.get(row.ppid) ?? []), row.pid]);
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

/** Ports each agent's process tree listens on (best effort: none when lsof is unavailable). */
async function listeningPorts(
  roots: number[],
  rows: readonly ProcessRow[],
): Promise<Map<number, number[]>> {
  if (!roots.length || process.platform === 'win32') return new Map();
  try {
    const tree = descendants(rows, roots);
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

/** The whole process table, one `ps`. LC_ALL=C keeps the start times in English whatever the user's language. */
export async function readProcessTable(): Promise<ProcessRow[]> {
  const { stdout } = await run('ps', ['-axo', PS_FORMAT], {
    timeout: 4000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, LC_ALL: 'C' },
  });
  return parseProcessTable(stdout);
}

const names = new ProcessNames();

export async function listAgentProcesses(): Promise<{
  processes: AgentProcess[];
  desktopCodex: boolean;
  table: ProcessRow[];
}> {
  const table = await readProcessTable();
  const byPid = new Map(table.map((row) => [row.pid, row]));
  const candidates = parseProcessList(table);
  const pids = candidates.map((c) => c.pid);
  const [cwds, ports] = await Promise.all([cwdsOf(pids), listeningPorts(pids, table)]); // independent: two lsof at once
  names.remember(table, new Set(descendants(table, pids).keys()));
  const zombies = zombiesUnder(table, pids, names);
  const processes = candidates.flatMap((c) => {
    const cwd = cwds.get(c.pid);
    return cwd
      ? [
          {
            ...c,
            cwd,
            ports: ports.get(c.pid) ?? [],
            orphaned: isOrphaned(c, byPid),
            zombies: zombies.get(c.pid) ?? [],
          },
        ]
      : [];
  });
  return {
    processes,
    table,
    desktopCodex: table.some((row) => /\bcodex\b[^\n]* app-server\b/.test(row.command)),
  };
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
