import { open, stat } from 'node:fs/promises';
import { z } from 'zod';

const TAIL_BYTES = 512 * 1024;
const SUBAGENT_STALE_MS = 10 * 60 * 1000;

const recordSchema = z.object({
  at: z.number(),
  provider: z.enum(['claude', 'codex']),
  event: z.string(),
  sessionId: z.string(),
  cwd: z.string(),
  agentId: z.string().optional(),
  agentType: z.string().optional(),
});
export type HookRecord = z.infer<typeof recordSchema>;

export type HookState = {
  activity: 'working' | 'idle' | 'ended';
  lastEvent: string;
  at: number;
  subagents: { id: string; type: string; lastSeen: number }[];
};

const WORKING_EVENTS = new Set(['UserPromptSubmit', 'PreToolUse', 'PostToolUse']);

export function parseSpool(text: string): HookRecord[] {
  return text.split('\n').flatMap((line) => {
    try {
      const parsed = recordSchema.safeParse(JSON.parse(line));
      return parsed.success ? [parsed.data] : [];
    } catch {
      return []; // partial first line of a tail read, or foreign content
    }
  });
}

// Pure: records are chronological. A session/subagent is only ever "active" from observed events.
export function deriveHookState(
  records: readonly HookRecord[],
  now: number,
): Map<string, HookState> {
  const states = new Map<string, HookState>();
  const running = new Map<string, Map<string, { type: string; lastSeen: number }>>();
  for (const r of records) {
    const key = `${r.provider}:${r.sessionId}`;
    const children = running.get(key) ?? new Map();
    running.set(key, children);
    if (r.agentId && r.event === 'SubagentStop') children.delete(r.agentId);
    else if (r.agentId)
      children.set(r.agentId, { type: r.agentType ?? 'subagent', lastSeen: r.at });
    if (r.agentId) {
      // Subagent traffic never changes the parent's activity; it only proves the parent is alive.
      if (!states.has(key))
        states.set(key, { activity: 'working', lastEvent: r.event, at: r.at, subagents: [] });
      continue;
    }
    const activity =
      r.event === 'SessionEnd' ? 'ended' : WORKING_EVENTS.has(r.event) ? 'working' : 'idle';
    states.set(key, { activity, lastEvent: r.event, at: r.at, subagents: [] });
  }
  for (const [key, state] of states) {
    const children = [...(running.get(key) ?? [])].map(([id, v]) => ({ id, ...v }));
    state.subagents =
      state.activity === 'ended'
        ? []
        : children.filter((c) => now - c.lastSeen < SUBAGENT_STALE_MS);
  }
  return states;
}

export async function readHookState(
  file: string,
  now = Date.now(),
): Promise<Map<string, HookState>> {
  try {
    const { size } = await stat(file);
    const handle = await open(file, 'r');
    try {
      const length = Math.min(size, TAIL_BYTES);
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, size - length);
      return deriveHookState(parseSpool(buffer.toString('utf8')), now);
    } finally {
      await handle.close();
    }
  } catch {
    return new Map(); // no spool: hooks not installed
  }
}
