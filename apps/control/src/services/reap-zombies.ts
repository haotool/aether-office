import { DomainError } from '@aether/kernel';
import type { LocalSession } from '@aether/contracts';
import { descendants, readProcessTable, zombiesUnder, type ProcessRow } from './agent-processes.js';

// A zombie is a finished process whose parent has not collected it. It cannot be killed: it is already dead. All that
// can be done is to remind its parent to collect it, which is what SIGCHLD is for; a parent that is still running and
// still listening reaps at once. One that is stuck, or never listens, keeps the zombie until it ends itself, and ending
// an agent session over a zombie is not done from here (stop is for sessions nobody is working in).

/** Pure. The living parents of the zombies under `root` (the root itself or something it started), with how many each holds. */
export function nudgeTargets(
  rows: readonly ProcessRow[],
  root: number,
): { pid: number; startedAt: number; zombies: number }[] {
  const owner = descendants(rows, [root]);
  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const held = new Map<number, number>();
  for (const row of rows) {
    if (!row.stat.startsWith('Z') || !owner.has(row.pid)) continue;
    const parent = byPid.get(row.ppid);
    // Only the session's own tree: its process, or what descends from it. Never a process that merely matched.
    if (!parent || parent.stat.startsWith('Z')) continue;
    if (parent.pid !== root && !owner.has(parent.pid)) continue;
    held.set(parent.pid, (held.get(parent.pid) ?? 0) + 1);
  }
  return [...held].map(([pid, zombies]) => ({
    pid,
    startedAt: byPid.get(pid)!.startedAt,
    zombies,
  }));
}

export type Reaped = { nudged: number; before: number; after: number };

/**
 * Reminds the parents of a session's zombies to collect them, then looks again. The session's process is named by pid
 * and start time and checked against the live table before any signal, as in stop-session.ts.
 */
export async function reapSessionZombies(input: {
  session: LocalSession | undefined;
  pid: number | null;
  startedAt: number;
  waitMs?: number;
  signal?: (pid: number) => void;
}): Promise<Reaped> {
  const { session, pid, startedAt } = input;
  if (!session) throw new DomainError('SESSION_NOT_FOUND', 404);
  if (session.process !== 'running' || pid === null) throw new DomainError('SESSION_NOT_RUNNING');
  if (session.liveness.startedAt !== startedAt) throw new DomainError('PROCESS_CHANGED');
  if (!session.liveness.zombies.length) throw new DomainError('NO_ZOMBIES');
  const table = await readProcessTable();
  if (table.find((row) => row.pid === pid)?.startedAt !== startedAt)
    throw new DomainError('PROCESS_CHANGED');
  const before = zombiesUnder(table, [pid]).get(pid)?.length ?? 0;
  const targets = nudgeTargets(table, pid);
  const signal = input.signal ?? ((target: number) => process.kill(target, 'SIGCHLD'));
  for (const target of targets) {
    try {
      signal(target.pid);
    } catch {
      /* it ended between the look and the signal: nothing to remind */
    }
  }
  await new Promise((resolve) => setTimeout(resolve, input.waitMs ?? 1500));
  const after = zombiesUnder(await readProcessTable(), [pid]).get(pid)?.length ?? 0;
  return { nudged: targets.length, before, after };
}
