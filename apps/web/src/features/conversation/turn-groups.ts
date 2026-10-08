/**
 * Pure. Turns a transcript tail (a flat list of messages, tool calls and tool results) into the shape a person reads:
 * turns (a prompt and what the agent did about it), in which consecutive tool calls fold into one group with their
 * results paired back by id.
 */
import type { Notice } from '@aether/kernel';
import { fill, translate, type Key } from '../../lib/i18n/i18n.js';

export type Entry = {
  at: number | null;
  role: 'user' | 'assistant' | 'tool' | 'result' | 'notice';
  name: string | null;
  text: string;
  error: boolean;
  toolId: string | null;
  summary: string | null;
  /** What a CLI wrapper carried (a finished background task, a command, injected context); absent from an older server. */
  notice?: Notice | null;
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
  | { type: 'tools'; calls: ToolCall[]; at: number | null }
  | { type: 'notices'; items: Notice[]; at: number | null };
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

const openTurn = (turns: Turn[], user: Turn['user']) => {
  const turn: Turn = {
    id: user ? `${user.at ?? 0}:${user.text.slice(0, 24)}` : 'head',
    user,
    blocks: [],
  };
  turns.push(turn);
  return turn;
};

const currentTurn = (turns: Turn[]) => turns.at(-1) ?? openTurn(turns, null);

const appendNotice = (turn: Turn, entry: Entry) => {
  if (!entry.notice) return;
  const last = turn.blocks.at(-1);
  if (last?.type === 'notices') last.items.push(entry.notice);
  else turn.blocks.push({ type: 'notices', items: [entry.notice], at: entry.at });
};

const appendToolCall = (turn: Turn, entry: Entry): ToolCall => {
  const name = entry.name ?? 'tool';
  const call: ToolCall = {
    id: entry.toolId,
    name,
    kind: kindOf(name),
    summary: entry.summary,
    at: entry.at,
    result: null,
  };
  const last = turn.blocks.at(-1);
  if (last?.type === 'tools') last.calls.push(call);
  else turn.blocks.push({ type: 'tools', calls: [call], at: entry.at });
  return call;
};

const attachResult = (entry: Entry, pending: Map<string, ToolCall>, lastCall: ToolCall | null) => {
  const call = (entry.toolId ? pending.get(entry.toolId) : lastCall) ?? null;
  if (call && !call.result) call.result = { text: entry.text, error: entry.error, at: entry.at };
};

export function groupTurns(entries: readonly Entry[]): Turn[] {
  const turns: Turn[] = [];
  const pending = new Map<string, ToolCall>(); // by tool id
  let lastCall: ToolCall | null = null; // for providers whose results carry no id
  for (const e of entries) {
    if (e.role === 'user') {
      openTurn(turns, { text: e.text, at: e.at });
      continue;
    }
    const turn = currentTurn(turns);
    if (e.role === 'notice') appendNotice(turn, e);
    else if (e.role === 'assistant')
      turn.blocks.push({ type: 'assistant', text: e.text, at: e.at });
    else if (e.role === 'tool') {
      const call = appendToolCall(turn, e);
      if (e.toolId) pending.set(e.toolId, call);
      lastCall = call;
    } else attachResult(e, pending, lastCall);
  }
  return turns;
}

/**
 * The new turns, each replaced by the previous object when it says the same thing, so a poll that changed only the newest
 * turn leaves every other row's props identical and its memoized render untouched.
 */
export function reuseTurns(previous: readonly Turn[], next: Turn[]): Turn[] {
  return next.map((turn, i) => {
    const before = previous[i];
    return before && before.id === turn.id && JSON.stringify(before) === JSON.stringify(turn)
      ? before
      : turn;
  });
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
  const say = (n: number, one: Key, many: Key = one) =>
    n > 0 ? fill(translate(locale, n === 1 ? one : many), n) : '';
  const parts = [
    say(counts.read, 'toolReadOne', 'toolReadMany'),
    say(counts.edit, 'toolEdit'),
    say(counts.run, 'toolRunOne', 'toolRunMany'),
    say(counts.other, 'toolOther'),
  ].filter(Boolean);
  return parts.join(' · ');
}

const signature = (e: Entry) => `${e.at ?? 0}|${e.role}|${e.text.slice(0, 40)}`;
/** The marker of the newest entry, to count what arrives after it. */
export const anchorOf = (entries: readonly Entry[]): string | null => {
  const last = entries.at(-1);
  return last ? signature(last) : null;
};

/** Messages (not tool traffic) that arrived after the anchor entry; all of them when the anchor slid out of the tail. */
export function newMessagesSince(entries: readonly Entry[], anchor: string | null): number {
  const from = anchor === null ? -1 : entries.map(signature).lastIndexOf(anchor);
  return entries.slice(from + 1).filter((e) => e.role === 'user' || e.role === 'assistant').length;
}
