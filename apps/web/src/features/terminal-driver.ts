import { api, execute } from '../api.js';
import type { Step } from './composer-model.js';

export type TerminalControl = {
  state: string;
  controlOwner: string | null;
  controlEpoch: number;
  leaseUntil: number | null;
};

/** A lease with less than this left is renewed before a send, so it cannot run out between the clear and the Enter. */
const LEASE_MARGIN_MS = 10_000;
const chains = new Map<string, Promise<unknown>>();

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Runs `task` after every earlier task of the same terminal: two messages never interleave their writes. */
export function serialized<T>(terminalId: string, task: () => Promise<T>): Promise<T> {
  const run = (chains.get(terminalId) ?? Promise.resolve()).then(task, task);
  const tail = run.then(
    () => undefined,
    () => undefined,
  );
  chains.set(terminalId, tail);
  // A drained queue is forgotten, so the map does not grow with every terminal ever driven.
  void tail.then(() => {
    if (chains.get(terminalId) === tail) chains.delete(terminalId);
  });
  return run;
}

/** How many terminals have sends still queued. */
export const pendingChains = () => chains.size;

/** Pure. Is the terminal under another person's lease? */
export const heldByOther = (c: TerminalControl, userId: string, now: number): boolean =>
  c.controlOwner !== null && c.controlOwner !== userId && (c.leaseUntil ?? 0) > now;

/** The control this person holds on the terminal, taken (or renewed) when needed; refuses when someone else holds it. */
async function control(projectId: string, terminalId: string, userId: string): Promise<number> {
  const now = await api<TerminalControl>(`/api/projects/${projectId}/terminals/${terminalId}`);
  if (now.state !== 'running') throw new Error('TERMINAL_NOT_RUNNING');
  if (heldByOther(now, userId, Date.now())) throw new Error('TERMINAL_ALREADY_CONTROLLED');
  if (now.controlOwner === userId && (now.leaseUntil ?? 0) - Date.now() > LEASE_MARGIN_MS)
    return now.controlEpoch;
  const taken = await execute(
    'terminal.takeover',
    { terminalId, epoch: now.controlEpoch },
    projectId,
  );
  return Number(taken.result['controlEpoch']);
}

/**
 * Writes the steps into the terminal in order, each after its delay, as one uninterrupted run. The terminal input route
 * queues each write, so an Enter always arrives after the body that came before it.
 */
export function writeSteps(
  projectId: string,
  terminalId: string,
  userId: string,
  steps: readonly Step[],
): Promise<void> {
  return serialized(terminalId, async () => {
    const epoch = await control(projectId, terminalId, userId);
    for (const step of steps) {
      if (step.delayMs) await sleep(step.delayMs);
      await execute('terminal.input', { terminalId, epoch, text: step.text }, projectId);
    }
  });
}

/** A request that failed because the network is down, not because the server said no. */
export const isNetworkError = (error: unknown): boolean => error instanceof TypeError;

/** Ends the AETHER terminal (the process in it): the epoch is read fresh, so a takeover by someone else in between is refused. */
export async function stopTerminal(projectId: string, terminalId: string): Promise<void> {
  const now = await api<TerminalControl>(`/api/projects/${projectId}/terminals/${terminalId}`);
  await execute('terminal.stop', { terminalId, epoch: now.controlEpoch }, projectId);
}
