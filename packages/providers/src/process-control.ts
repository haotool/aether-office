import { execFileSync } from 'node:child_process';

/**
 * A child leads its own process group, so one signal reaches everything it started. A stop is SIGTERM, a bounded wait,
 * then SIGKILL. A pid is signalled only while it is still the process that was started (pids are reused; a pid and its
 * start time are not).
 */
type Stoppable = {
  pid?: number | undefined;
  exitCode?: number | null;
  signalCode?: NodeJS.Signals | null;
  kill: (signal?: NodeJS.Signals) => unknown;
};

const STOP_GRACE_MS = 1000;

/**
 * A group already gone is not an error, and neither is EPERM: a group AETHER started is the user's own, so EPERM can
 * only be macOS answering for a group whose members have all exited.
 */
export function signalGroup(pid: number, signal: NodeJS.Signals): boolean {
  try {
    process.kill(-pid, signal);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ESRCH' || code === 'EPERM') return false;
    throw error;
  }
}

export function groupAlive(pid: number): boolean {
  try {
    process.kill(-pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * SIGTERM to the child's group now, SIGKILL after `graceMs` unless `cancel()` was called first. `stop` is idempotent:
 * asking twice does not restart the wait. The caller cancels once the child has closed (all its pipes shut), not merely
 * exited.
 */
export function groupStopper(
  child: Stoppable,
  graceMs = STOP_GRACE_MS,
): { stop: () => void; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const send = (signal: NodeJS.Signals) => {
    if (process.platform !== 'win32' && child.pid) signalGroup(child.pid, signal);
    else if ((child.exitCode ?? null) === null && (child.signalCode ?? null) === null)
      child.kill(signal);
  };
  return {
    stop: () => {
      send('SIGTERM');
      timer ??= setTimeout(() => {
        try {
          send('SIGKILL');
        } catch {
          /* not ours to signal after all: nothing more can be done from a timer */
        }
      }, graceMs);
      timer.unref();
    },
    cancel: () => clearTimeout(timer),
  };
}

type Inspected = { ppid: number; stat: string; startedAt: string; command: string };

export function inspectProcess(pid: number): Inspected | null {
  try {
    const out = execFileSync('ps', ['-p', String(pid), '-o', 'lstart=,ppid=,stat=,command='], {
      encoding: 'utf8',
      timeout: 2000,
      env: { ...process.env, LC_ALL: 'C' },
    }).trimEnd();
    const m = /^(.{24}) +(\d+) +(\S+) +(.*)$/.exec(out.split('\n')[0] ?? '');
    if (!m) return null;
    const [, startedAt = '', ppid, stat = '', command = ''] = m;
    return { startedAt: startedAt.trim(), ppid: Number(ppid), stat, command };
  } catch {
    return null;
  }
}

// The manager that adopts a user's orphans on Linux, in place of init. The gap is bounded so a very long command line
// cannot backtrack quadratically.
const ORPHAN_ADOPTER = /(?:^|\/)systemd\s.{0,256}--user\b/;

export function isOrphan(
  info: Pick<Inspected, 'ppid'>,
  parent: Pick<Inspected, 'command'> | null,
): boolean {
  return info.ppid <= 1 || parent === null || ORPHAN_ADOPTER.test(parent.command);
}

type Survivor = 'gone' | 'reused' | 'zombie' | 'owned' | 'orphaned';

/**
 * Pure. What a process recorded as `pid:start` is now. Only 'orphaned' may be signalled: it is the same process (start
 * time equal), still running, and nothing alive owns it. 'owned' is left to its parent, 'reused' is somebody else's.
 */
export function judgeSurvivor(
  recordedStart: string,
  observed: Inspected | null,
  parent: Pick<Inspected, 'command'> | null,
): Survivor {
  if (!observed) return 'gone';
  if (observed.startedAt !== recordedStart) return 'reused';
  if (observed.stat.startsWith('Z')) return 'zombie';
  return isOrphan(observed, parent) ? 'orphaned' : 'owned';
}

/** `pid:start` as processIdentity writes it (the start time has colons of its own). */
export function parseIdentity(identity: string): { pid: number; startedAt: string } | null {
  const m = /^(\d+):(.+)$/.exec(identity);
  return m ? { pid: Number(m[1]), startedAt: (m[2] ?? '').trim() } : null;
}

export type Reaped = {
  identity: string;
  verdict: Survivor;
  action: 'none' | 'terminated' | 'killed' | 'survived';
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Signals a process only if it is still the recorded one and was orphaned by the runner's death: SIGTERM to the group,
 * a bounded wait, then SIGKILL, with the identity checked again before each signal so a reused pid is never hit. Never
 * by name or command line: a command line is not an identity.
 */
export async function reapSurvivor(identity: string, graceMs = 3000): Promise<Reaped> {
  const recorded = parseIdentity(identity);
  if (!recorded) return { identity, verdict: 'gone', action: 'none' };
  const look = () => {
    const observed = inspectProcess(recorded.pid);
    return judgeSurvivor(
      recorded.startedAt,
      observed,
      observed ? inspectProcess(observed.ppid) : null,
    );
  };
  const verdict = look();
  if (verdict !== 'orphaned') return { identity, verdict, action: 'none' };
  signalGroup(recorded.pid, 'SIGTERM');
  for (let waited = 0; waited < graceMs; waited += 100) {
    await sleep(100);
    if (look() !== 'orphaned') return { identity, verdict, action: 'terminated' };
  }
  if (look() !== 'orphaned') return { identity, verdict, action: 'terminated' };
  signalGroup(recorded.pid, 'SIGKILL');
  await sleep(300);
  return { identity, verdict, action: look() === 'orphaned' ? 'survived' : 'killed' };
}
