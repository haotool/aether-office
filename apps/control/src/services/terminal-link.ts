import { parseStartTime, readProcessTable, type ProcessRow } from './agent-processes.js';
import type { Context } from './context.js';

const MAX_ANCESTORS = 12;

/** Pure. Splits a runner's process identity (`<pid>:<ps lstart>`) into the pid and its start time. */
export function parseIdentity(identity: string): { pid: number; startedAt: number } | null {
  const at = identity.indexOf(':');
  const startedAt = at > 0 ? parseStartTime(identity.slice(at + 1)) : null;
  return startedAt === null || !/^\d+$/.test(identity.slice(0, at))
    ? null
    : { pid: Number(identity.slice(0, at)), startedAt };
}

/**
 * Pure. The terminal AETHER started a session's process in, if any: the process, or one of the processes above it (a
 * wrapper script), is the terminal's own child, by pid and by start time, so a reused pid is not mistaken for it.
 */
export function terminalOfProcess(
  table: readonly ProcessRow[],
  pid: number,
  terminals: readonly { id: string; identity: string }[],
): string | null {
  const byPid = new Map(table.map((row) => [row.pid, row]));
  const owned = terminals.flatMap((t) => {
    const identity = parseIdentity(t.identity);
    return identity ? [{ id: t.id, ...identity }] : [];
  });
  let row = byPid.get(pid);
  for (let hops = 0; row && hops < MAX_ANCESTORS; hops++) {
    const here: ProcessRow = row;
    const found = owned.find((t) => t.pid === here.pid && t.startedAt === here.startedAt);
    if (found) return found.id;
    row = byPid.get(here.ppid);
  }
  return null;
}

/** The running terminals of these projects, with the identity of the process each runs. */
function runningTerminals(ctx: Context, projectIds: readonly string[]) {
  const rows = ctx.sqlite
    .prepare("SELECT id,projectId,snapshot FROM terminal_sessions WHERE state='running'")
    .all() as { id: string; projectId: string; snapshot: string | null }[];
  return rows.flatMap((r) => {
    if (!projectIds.includes(r.projectId) || !r.snapshot) return [];
    try {
      const identity = (JSON.parse(r.snapshot) as { processIdentity?: unknown }).processIdentity;
      return typeof identity === 'string' ? [{ id: r.id, projectId: r.projectId, identity }] : [];
    } catch {
      return [];
    }
  });
}

/** The terminal behind a local session's process, among those of the projects the caller may open. */
export async function terminalOfSession(
  ctx: Context,
  pid: number | null,
  projectIds: readonly string[],
): Promise<{ terminalId: string; projectId: string } | null> {
  if (!pid) return null;
  const terminals = runningTerminals(ctx, projectIds);
  if (!terminals.length) return null;
  const id = terminalOfProcess(await readProcessTable(), pid, terminals);
  const terminal = terminals.find((t) => t.id === id);
  return terminal ? { terminalId: terminal.id, projectId: terminal.projectId } : null;
}
