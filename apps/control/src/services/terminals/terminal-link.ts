import { parseStartTime, readProcessTable, type ProcessRow } from '../runtime/agent-processes.js';
import { claudeSessionOf } from '../runtime/claude-process-sessions.js';
import type { Context } from '../domain/context.js';

const MAX_ANCESTORS = 12;

export function parseIdentity(identity: string): { pid: number; startedAt: number } | null {
  const at = identity.indexOf(':');
  const startedAt = at > 0 ? parseStartTime(identity.slice(at + 1)) : null;
  return startedAt === null || !/^\d+$/.test(identity.slice(0, at))
    ? null
    : { pid: Number(identity.slice(0, at)), startedAt };
}

/**
 * The terminal AETHER started a session's process in, if any: the process or one above it (a wrapper script) is the
 * terminal's own child, matched by pid and start time so a reused pid is not mistaken for it.
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

export async function terminalOfClaudeSession(
  home: string,
  sessionId: string,
  terminals: readonly { id: string; identity: string }[],
): Promise<string | null> {
  for (const terminal of terminals) {
    const process = parseIdentity(terminal.identity);
    if (process && (await claudeSessionOf(home, process)) === sessionId) return terminal.id;
  }
  return null;
}

export async function terminalOfNamedSession(
  ctx: Context,
  home: string,
  key: string,
  projectIds: readonly string[],
): Promise<{ terminalId: string; projectId: string } | null> {
  if (!key.startsWith('claude:')) return null;
  const terminals = runningTerminals(ctx, projectIds);
  const id = await terminalOfClaudeSession(home, key.slice('claude:'.length), terminals);
  const terminal = terminals.find((t) => t.id === id);
  return terminal ? { terminalId: terminal.id, projectId: terminal.projectId } : null;
}

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
