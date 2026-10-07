import { SESSION_ACTIVE_MS } from '@aether/contracts';
import type { AgentProcess, Zombie } from './agent-processes.js';

/**
 * How alive a local session is, on two separate questions the projects reviewed (gascity, gastown) keep apart: is a
 * process there at all, and is anything happening in it. A process can be alive and idle for a day; that is a different
 * thing from an orphan nobody owns or a zombie nobody collected, and each calls for something different from the owner.
 */
type LivenessState =
  | 'active' // work seen in the last couple of minutes
  | 'idle' // alive, quiet for a while: waiting for its person
  | 'dormant' // alive, quiet for hours: probably forgotten
  | 'orphaned' // alive, but whatever started it has gone
  | 'ended' // no process
  | 'unknown'; // cannot tell (Codex Desktop threads share one app server)
export type Liveness = {
  state: LivenessState;
  startedAt: number | null;
  quietMs: number | null;
  /** Finished processes under it that nobody collected (see AgentProcess.zombies). */
  zombies: Zombie[];
};

export const DORMANT_MS = 6 * 60 * 60 * 1000;
const BUSY_CPU_SECONDS = 0.5; // CPU used between two looks that counts as doing something

/** Pure. */
export function classifyLiveness(input: {
  process: AgentProcess | null;
  state: 'running' | 'none' | 'unknown';
  mtime: number;
  hookAt: number | null;
  busyAt: number | null;
  now: number;
}): Liveness {
  const { process, now } = input;
  if (input.state === 'unknown')
    return { state: 'unknown', startedAt: null, quietMs: null, zombies: [] };
  if (input.state === 'none' || !process)
    return { state: 'ended', startedAt: null, quietMs: null, zombies: [] };
  // The latest sign of life: the transcript written, a hook event, CPU burned — never earlier than the start.
  const lastSign = Math.max(input.mtime, input.hookAt ?? 0, input.busyAt ?? 0, process.startedAt);
  const quietMs = Math.max(0, now - lastSign);
  const state: LivenessState = process.orphaned
    ? 'orphaned'
    : quietMs < SESSION_ACTIVE_MS
      ? 'active'
      : quietMs < DORMANT_MS
        ? 'idle'
        : 'dormant';
  return { state, startedAt: process.startedAt, quietMs, zombies: process.zombies };
}

/**
 * Remembers each process's CPU time from one look to the next, so "has it done anything lately" does not rest on the
 * transcript alone (a long build in a quiet transcript is not a dormant session). Keyed by pid and start time, so a
 * reused pid is a new process. In memory only: after a restart the first look has no history and says nothing.
 */
export class CpuWatch {
  private seen = new Map<string, { cpuSeconds: number; busyAt: number | null }>();
  private key = (p: Pick<AgentProcess, 'pid' | 'startedAt'>) => `${p.pid}:${p.startedAt}`;

  observe(processes: readonly AgentProcess[], now: number): void {
    const next = new Map<string, { cpuSeconds: number; busyAt: number | null }>();
    for (const p of processes) {
      const before = this.seen.get(this.key(p));
      const busy = before
        ? p.cpuSeconds - before.cpuSeconds >= BUSY_CPU_SECONDS
        : p.cpuPercent >= 5; // first look: ps's own recent average
      next.set(this.key(p), {
        cpuSeconds: p.cpuSeconds,
        busyAt: busy ? now : (before?.busyAt ?? null),
      });
    }
    this.seen = next; // processes that went away are forgotten here
  }

  busyAt(p: Pick<AgentProcess, 'pid' | 'startedAt'>): number | null {
    return this.seen.get(this.key(p))?.busyAt ?? null;
  }
}
