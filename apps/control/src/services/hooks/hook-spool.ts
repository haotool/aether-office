import { open, stat } from 'node:fs/promises';
import { z } from 'zod';
import { commandTagSchema, type CommandTag, type Subagent } from '@aether/contracts';
import { redactSecrets } from '../platform/redaction.js';

const RECENT_TOOLS = 8;
const TARGET_CHARS = 48;
const TAIL_BYTES = 512 * 1024;
const SUBAGENT_STALE_MS = 10 * 60 * 1000;
/** A finished subagent stays visible this long, so the page sees the transition instead of a disappearance. */
export const FINISHED_GRACE_MS = 90 * 1000;

const recordSchema = z.object({
  at: z.number(),
  provider: z.enum(['claude', 'codex']),
  event: z.string(),
  sessionId: z.string(),
  cwd: z.string(),
  agentId: z.string().optional(),
  agentType: z.string().optional(),
  tool: z.string().optional(),
  target: z.string().optional(),
  notification: z.string().optional(),
  toolUseId: z.string().max(80).optional(),
  tags: z.array(z.string().max(40)).max(8).optional(),
  ok: z.boolean().optional(),
});
type HookRecord = z.infer<typeof recordSchema>;

export type HookState = {
  activity: 'working' | 'idle' | 'waiting_permission' | 'ended';
  lastEvent: string;
  at: number;
  tool: string | null;
  // `toolUseId` stays on the server: it pairs a call with its result and is not sent on. Targets are short and redacted
  // (a file's base name, a command's first word).
  recent: HookCall[];
  subagents: Subagent[];
};
type HookCall = {
  tool: string;
  target: string | null;
  at: number;
  agentId: string | null;
  tags: CommandTag[];
  ok: boolean | null;
  toolUseId: string | null;
};

type Child = Omit<Subagent, 'source' | 'status' | 'nickname' | 'label' | 'tokens' | 'result'> & {
  waiting: boolean;
};
const newChild = (id: string, r: HookRecord, startedAt: number | null): Child => ({
  id,
  type: r.agentType ?? 'subagent',
  lastSeen: r.at,
  startedAt,
  endedAt: null,
  tools: null,
  waiting: false,
});

function foldChild(children: Map<string, Child>, r: HookRecord, id: string) {
  if (r.event === 'SubagentStart') return void children.set(id, newChild(id, r, r.at));
  const child = children.get(id) ?? newChild(id, r, r.event === 'SubagentStop' ? null : r.at);
  children.set(id, child);
  if (child.endedAt !== null) return;
  child.lastSeen = r.at;
  child.waiting = asksPermission(r);
  if (r.event === 'SubagentStop') child.endedAt = r.at;
  if (r.event === 'PreToolUse' && r.tool)
    child.tools = { count: (child.tools?.count ?? 0) + 1, last: r.tool, lastAt: r.at };
}

const statusOf = (c: Child): Subagent['status'] =>
  c.endedAt !== null ? 'finished' : c.waiting ? 'waiting_permission' : 'running';

const isVisible = (c: Child, now: number) =>
  c.endedAt !== null ? now - c.endedAt < FINISHED_GRACE_MS : now - c.lastSeen < SUBAGENT_STALE_MS;

const WORKING_EVENTS = new Set([
  'UserPromptSubmit',
  'PreToolUse',
  'PostToolUse',
  'PostToolUseFailure',
]);
// The agent is blocked on a human until its next event: a permission request, or Claude's notification that it
// needs a permission or an answer (elicitation).
const NEEDS_HUMAN = new Set(['permission_prompt', 'elicitation_dialog']);
const asksPermission = (r: HookRecord) =>
  r.event === 'PermissionRequest' ||
  (r.event === 'Notification' && NEEDS_HUMAN.has(r.notification ?? ''));

export function parseSpool(text: string): HookRecord[] {
  return text.split('\n').flatMap((line) => {
    try {
      const parsed = recordSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return [];
    }
  });
}

const callOf = (r: HookRecord): HookCall | null =>
  r.event === 'PreToolUse' && r.tool
    ? {
        tool: r.tool,
        target: r.target ? redactSecrets(r.target).slice(0, TARGET_CHARS) : null,
        at: r.at,
        agentId: r.agentId ?? null,
        tags: (r.tags ?? [])
          .flatMap((t) => {
            const tag = commandTagSchema.safeParse(t);
            return tag.success ? [tag.data] : [];
          })
          .slice(0, 4),
        ok: null,
        toolUseId: r.toolUseId ?? null,
      }
    : null;

// The outcome the provider reported for a call already in the list, matched by its id (never by time or order).
const settled = (recent: HookCall[], r: HookRecord): HookCall[] => {
  const { ok, toolUseId } = r;
  if (!toolUseId || ok === undefined) return recent;
  if (r.event !== 'PostToolUse' && r.event !== 'PostToolUseFailure') return recent;
  return recent.map((c) => (c.toolUseId === toolUseId ? { ...c, ok } : c));
};

function stateAfter(before: HookState | undefined, r: HookRecord, recent: HookCall[]): HookState {
  if (r.agentId) {
    // Subagent traffic never changes the parent's activity; it only proves the parent is alive.
    return before
      ? { ...before, recent }
      : { activity: 'working', lastEvent: r.event, at: r.at, tool: null, recent, subagents: [] };
  }
  const activity = asksPermission(r)
    ? 'waiting_permission'
    : r.event === 'SessionEnd'
      ? 'ended'
      : WORKING_EVENTS.has(r.event)
        ? 'working'
        : 'idle';
  return {
    activity,
    lastEvent: r.event,
    at: r.at,
    tool: r.event === 'PreToolUse' ? (r.tool ?? null) : null,
    recent,
    subagents: [],
  };
}

function visibleSubagents(state: HookState, running: Map<string, Child> | undefined, now: number) {
  if (state.activity === 'ended') return [];
  return [...(running ?? []).values()]
    .filter((c) => isVisible(c, now))
    .map(({ waiting, ...c }): Subagent => ({
      ...c,
      source: 'hook',
      status: statusOf({ ...c, waiting }),
      nickname: null,
      label: null,
      tokens: null,
      result: null,
    }));
}

export function deriveHookState(
  records: readonly HookRecord[],
  now: number,
): Map<string, HookState> {
  const states = new Map<string, HookState>();
  const running = new Map<string, Map<string, Child>>();
  for (const r of records) {
    const key = `${r.provider}:${r.sessionId}`;
    const children = running.get(key) ?? new Map<string, Child>();
    running.set(key, children);
    if (r.agentId) foldChild(children, r, r.agentId);
    const call = callOf(r);
    const before = states.get(key);
    const recent = call
      ? [...(before?.recent ?? []), call].slice(-RECENT_TOOLS)
      : settled(before?.recent ?? [], r);
    states.set(key, stateAfter(before, r, recent));
  }
  for (const [key, state] of states)
    state.subagents = visibleSubagents(state, running.get(key), now);
  return states;
}

async function tail(file: string): Promise<string | null> {
  try {
    const { size } = await stat(file);
    const handle = await open(file, 'r');
    try {
      const length = Math.min(size, TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      return buffer.toString('utf8');
    } finally {
      await handle.close();
    }
  } catch {
    return null;
  }
}

// The receiver moves a full spool to `<file>.1` and starts a new one, so the newest records may sit at the end of the
// rotated file: read its tail first, then the current file's, or every session's state would vanish at each rotation.
export async function readHookState(
  file: string,
  now = Date.now(),
): Promise<Map<string, HookState>> {
  const parts = [await tail(`${file}.1`), await tail(file)].filter((p) => p !== null);
  return deriveHookState(parseSpool(parts.join('\n')), now);
}
