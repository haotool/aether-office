/**
 * Pure. Turns a transcript tail (a flat list of messages, tool calls and tool results) into the shape a person reads:
 * turns (a prompt and what the agent did about it), in which consecutive tool calls fold into one group with their
 * results paired back by id.
 */
export type Entry = {
  at: number | null;
  role: 'user' | 'assistant' | 'tool' | 'result';
  name: string | null;
  text: string;
  error: boolean;
  toolId: string | null;
  summary: string | null;
};

type ToolKind = 'read' | 'edit' | 'run' | 'other';
export type ToolCall = {
  id: string | null;
  name: string;
  kind: ToolKind;
  /** The call's target (a path, a command), cut short. */
  summary: string | null;
  /** When the call was made. */
  at: number | null;
  /** Null until the result arrives: the call is still running. */
  result: { text: string; error: boolean; at: number | null } | null;
};
type Block =
  | { type: 'assistant'; text: string; at: number | null }
  | { type: 'tools'; calls: ToolCall[]; at: number | null };
export type Turn = {
  /** Stable while the tail slides: the prompt's time and start, or "head" for a turn whose prompt is cut off. */
  id: string;
  user: { text: string; at: number | null } | null;
  blocks: Block[];
};

const READ = /^(read|grep|glob|ls|list|notebookread|webfetch|websearch|search|view|find|cat)/i;
const EDIT = /^(edit|write|multiedit|notebookedit|apply_patch|patch|create)/i;
const RUN = /^(bash|shell|exec|local_shell|run|command|terminal)/i;
export const kindOf = (name: string): ToolKind =>
  EDIT.test(name) ? 'edit' : RUN.test(name) ? 'run' : READ.test(name) ? 'read' : 'other';

export function groupTurns(entries: readonly Entry[]): Turn[] {
  const turns: Turn[] = [];
  const open = (user: Turn['user']) => {
    const turn: Turn = {
      id: user ? `${user.at ?? 0}:${user.text.slice(0, 24)}` : 'head',
      user,
      blocks: [],
    };
    turns.push(turn);
    return turn;
  };
  const pending = new Map<string, ToolCall>(); // by tool id
  let lastCall: ToolCall | null = null; // for providers whose results carry no id
  for (const e of entries) {
    if (e.role === 'user') {
      open({ text: e.text, at: e.at });
      continue;
    }
    const current = turns.at(-1) ?? open(null);
    const last = current.blocks.at(-1);
    if (e.role === 'assistant') {
      current.blocks.push({ type: 'assistant', text: e.text, at: e.at });
    } else if (e.role === 'tool') {
      const name = e.name ?? 'tool';
      const call: ToolCall = {
        id: e.toolId,
        name,
        kind: kindOf(name),
        summary: e.summary,
        at: e.at,
        result: null,
      };
      if (last?.type === 'tools') last.calls.push(call);
      else current.blocks.push({ type: 'tools', calls: [call], at: e.at });
      if (e.toolId) pending.set(e.toolId, call);
      lastCall = call;
    } else {
      // A result whose call fell off the front of the tail has nothing to attach to and is dropped.
      const call = (e.toolId ? pending.get(e.toolId) : lastCall) ?? null;
      if (call && !call.result) call.result = { text: e.text, error: e.error, at: e.at };
    }
  }
  return turns;
}

/** A path shortened from the front ("…/src/features/a.ts"): the end of a path is what tells files apart. */
export function shortTarget(target: string): string {
  const parts = target.split('/');
  return target.startsWith('/') && parts.length > 4 ? `…/${parts.slice(-3).join('/')}` : target;
}

/** How many calls of each kind a group holds, and whether any is still running or failed. */
export function countCalls(calls: readonly ToolCall[]) {
  const counts: Record<ToolKind, number> = { read: 0, edit: 0, run: 0, other: 0 };
  for (const c of calls) counts[c.kind]++;
  return {
    counts,
    running: calls.filter((c) => c.result === null).at(-1) ?? null,
    failed: calls.filter((c) => c.result?.error).length,
  };
}

/** How long a group has taken: from its first call to its last result, or to `now` while one still runs. Null if untimed. */
export function groupSpanMs(calls: readonly ToolCall[], now: number): number | null {
  const start = Math.min(...calls.map((c) => c.at ?? Infinity));
  if (!Number.isFinite(start)) return null;
  const running = calls.some((c) => c.result === null);
  const end = running ? now : Math.max(...calls.map((c) => c.result?.at ?? c.at ?? 0));
  return Math.max(0, end - start);
}

/** "8s", "2m 05s": a duration at a glance. */
export function shortDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds < 60
    ? `${Math.max(seconds, 1)}s`
    : `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, '0')}s`;
}

/** "read 4 files · edited 2 · ran 1 command": what a group of tool calls did, in a few words. */
export function toolSummaryText(calls: readonly ToolCall[], locale: 'zh-TW' | 'en'): string {
  const { counts } = countCalls(calls);
  const zh = locale === 'zh-TW';
  const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
  const parts = [
    counts.read &&
      (zh
        ? `讀取 ${counts.read} 次`
        : `read ${counts.read} ${plural(counts.read, 'file', 'files')}`),
    counts.edit && (zh ? `編輯 ${counts.edit} 次` : `edited ${counts.edit}`),
    counts.run &&
      (zh
        ? `執行 ${counts.run} 個指令`
        : `ran ${counts.run} ${plural(counts.run, 'command', 'commands')}`),
    counts.other && (zh ? `其他 ${counts.other} 次` : `${counts.other} other`),
  ].filter(Boolean);
  return parts.join(' · ');
}

const signature = (e: Entry) => `${e.at ?? 0}|${e.role}|${e.text.slice(0, 40)}`;
/** The marker of the newest entry, to count what arrives after it. */
export const anchorOf = (entries: readonly Entry[]): string | null =>
  entries.length ? signature(entries[entries.length - 1]!) : null;

/** Messages (not tool traffic) that arrived after the anchor entry; all of them when the anchor slid out of the tail. */
export function newMessagesSince(entries: readonly Entry[], anchor: string | null): number {
  const from = anchor === null ? -1 : entries.map(signature).lastIndexOf(anchor);
  return entries.slice(from + 1).filter((e) => e.role === 'user' || e.role === 'assistant').length;
}
