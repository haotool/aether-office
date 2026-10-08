import { DomainError } from '@aether/kernel';
import type { LocalSession } from '@aether/contracts';
import { readProcessTable } from './agent-processes.js';

/** Only a session nobody is working in may be stopped from here: one forgotten for hours, or left without an owner. */
const STOPPABLE = ['dormant', 'orphaned'] as const;
type Stopped = 'stopped' | 'still_running' | 'changed' | 'zombie';

const KILL_WAIT_MS = 2000;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const exists = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
};

/**
 * Asks one process to end and waits for it. It is named by pid and start time, and that is checked against the live
 * process table right before the signal, so a pid reused in the meantime is never hit. SIGTERM goes to that process
 * alone (it may be someone's terminal session; its group is not ours), and one that does not end within `graceMs` is
 * reported rather than killed: the person who asked decides what comes next. Unless they asked in advance (`force`, for
 * the bulk clock-out): then it is sent SIGKILL, once more checked to be the same process, and given a moment to vanish.
 */
export async function stopProcess(
  pid: number,
  startedAt: number,
  graceMs = 5000,
  force = false,
): Promise<Stopped> {
  const row = (await readProcessTable()).find((r) => r.pid === pid);
  if (!row) return 'stopped'; // already gone
  if (row.startedAt !== startedAt) return 'changed';
  if (row.stat.startsWith('Z')) return 'zombie';
  process.kill(pid, 'SIGTERM');
  for (let waited = 0; waited < graceMs; waited += 100) {
    await sleep(100);
    if (!exists(pid)) return 'stopped';
  }
  const after = (await readProcessTable()).find((r) => r.pid === pid);
  if (!after || after.startedAt !== startedAt) return 'stopped';
  if (!force) return 'still_running';
  process.kill(pid, 'SIGKILL');
  for (let waited = 0; waited < KILL_WAIT_MS; waited += 100) {
    await sleep(100);
    if (!exists(pid)) return 'stopped';
  }
  return 'still_running';
}

/**
 * Stops the process behind a local session, on an owner's request. Every step refuses rather than guesses: the session
 * must still be the one the person saw (same process: start time included), must be dormant or orphaned by the server's
 * own reckoning (the client's word is not taken), and must not be this server or anything above it in the process tree.
 */
export async function stopLocalSession(input: {
  session: LocalSession | undefined;
  pid: number | null;
  startedAt: number;
  controlPid?: number;
  graceMs?: number;
  /** SIGKILL a process that ignored SIGTERM (see stopProcess). */
  force?: boolean;
}): Promise<{ outcome: Stopped }> {
  const { session, pid, startedAt } = input;
  if (!session) throw new DomainError('SESSION_NOT_FOUND', 404);
  if (session.process !== 'running' || pid === null) throw new DomainError('SESSION_NOT_RUNNING');
  if (session.liveness.startedAt !== startedAt) throw new DomainError('PROCESS_CHANGED');
  if (!(STOPPABLE as readonly string[]).includes(session.liveness.state))
    throw new DomainError('SESSION_NOT_STALE');
  const byPid = new Map((await readProcessTable()).map((row) => [row.pid, row]));
  for (
    let at: number | undefined = input.controlPid ?? process.pid, hops = 0;
    at && at > 1 && hops < 64;
    hops++
  ) {
    if (at === pid) throw new DomainError('REFUSED_OWN_ANCESTOR');
    at = byPid.get(at)?.ppid;
  }
  if (byPid.get(pid)?.startedAt !== startedAt) throw new DomainError('PROCESS_CHANGED');
  return { outcome: await stopProcess(pid, startedAt, input.graceMs, input.force) };
}
