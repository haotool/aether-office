import { SESSION_ACTIVE_MS } from '@aether/contracts';
import type { AgentProcess, Zombie } from '../runtime/agent-processes.js';

/**
 * How alive a local session is, on two separate questions: is a process there at all, and is anything happening in it.
 * A process can be alive and idle for a day; that is different from an orphan nobody owns or a zombie nobody collected.
 */
type LivenessState = 'active' | 'idle' | 'dormant' | 'orphaned' | 'ended' | 'unknown'; // cannot tell (Codex Desktop threads share one app server)
type Liveness = {
  state: LivenessState;
  startedAt: number | null;
  quietMs: number | null;
  zombies: Zombie[];
};

export const DORMANT_MS = 6 * 60 * 60 * 1000;
const BUSY_CPU_SECONDS = 0.5;

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

export class CpuWatch {
  private seen = new Map<string, { cpuSeconds: number; busyAt: number | null }>();
  private key = (p: Pick<AgentProcess, 'pid' | 'startedAt'>) => `${p.pid}:${p.startedAt}`;

  observe(processes: readonly AgentProcess[], now: number): void {
    const next = new Map<string, { cpuSeconds: number; busyAt: number | null }>();
    for (const p of processes) {
      const before = this.seen.get(this.key(p));
      const busy = before
        ? p.cpuSeconds - before.cpuSeconds >= BUSY_CPU_SECONDS
        : p.cpuPercent >= 5;
      next.set(this.key(p), {
        cpuSeconds: p.cpuSeconds,
        busyAt: busy ? now : (before?.busyAt ?? null),
      });
    }
    this.seen = next;
  }

  busyAt(p: Pick<AgentProcess, 'pid' | 'startedAt'>): number | null {
    return this.seen.get(this.key(p))?.busyAt ?? null;
  }
}
