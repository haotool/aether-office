import type { AttributedSession } from '@aether/contracts';
import type { LifeSignal } from '@aether/office-scene/model';
import { LOCAL_PREFIX } from '../../lib/sessions/session-names.js';
import { emptyOutcomes, outcomeSignals, type OutcomeMemory } from './life-outcomes.js';

export type LifeSnapshot = {
  at: number;
  sessions: readonly AttributedSession[];
  agents: readonly { id: string; activity: string }[];
};

export type LifeMemory = {
  dirtySince: Readonly<Record<string, number>>;
  debtAt: Readonly<Record<string, number>>;
  outcomes: OutcomeMemory;
};
export const emptyLifeMemory: LifeMemory = { dirtySince: {}, debtAt: {}, outcomes: emptyOutcomes };

const THINK_MS = 45_000;
const THINK_GIVE_UP_MS = 15 * 60_000;
const LONG_WORK_MS = 2 * 60 * 60_000;
const RETRY_WINDOW_MS = 120_000;
const RETRY_COUNT = 4;
const DEBT_FILES = 20;
const DEBT_SUSTAIN_MS = 30 * 60_000;
const DEBT_REPEAT_MS = 15 * 60_000;
const IDLE_MS = 5 * 60_000;
/** A call seen for the first time at page load counts only if it is this fresh; the scheduler drops older news too. */
const FRESH_MS = 30_000;

const ownCalls = (s: AttributedSession) => (s.hook?.recent ?? []).filter((c) => !c.agentId);

const thinking = (s: AttributedSession, at: number) =>
  s.hook?.activity === 'working' &&
  !s.hook.tool &&
  at - s.hook.at >= THINK_MS &&
  at - s.hook.at < THINK_GIVE_UP_MS;

const longWorking = (s: AttributedSession, at: number) =>
  s.hook?.activity === 'working' &&
  s.liveness.startedAt !== null &&
  at - s.liveness.startedAt >= LONG_WORK_MS;

function repeats(s: AttributedSession, at: number): { count: number; target: string | null } {
  const counts = new Map<string, number>();
  for (const c of ownCalls(s))
    if (c.tool === 'Bash' && c.target && at - c.at <= RETRY_WINDOW_MS)
      counts.set(c.target, (counts.get(c.target) ?? 0) + 1);
  const [target, count] = [...counts].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  return { count, target };
}

const idleLong = (s: AttributedSession) =>
  s.liveness.state === 'idle' && (s.liveness.quietMs ?? 0) >= IDLE_MS;

type Scan = {
  prev: LifeSnapshot | null;
  at: number;
  memory: LifeMemory;
  signals: LifeSignal[];
  dirtySince: Record<string, number>;
  debtAt: Record<string, number>;
  outcomes: LifeMemory['outcomes'];
};

const prevScanAt = (prev: LifeSnapshot | null, at: number) => (prev ? prev.at : at);

const scanToolStarts = (
  s: AttributedSession,
  member: string,
  seenUntil: number,
  signals: LifeSignal[],
) => {
  for (const c of ownCalls(s).filter((call) => call.at > seenUntil))
    signals.push({
      kind: 'tool.start',
      member,
      at: c.at,
      tool: c.tool,
      target: c.target,
      ...(c.tags.length ? { tags: c.tags } : {}),
    });
};

const scanStateEdges = (
  scan: Scan,
  s: AttributedSession,
  old: AttributedSession | undefined,
  member: string,
) => {
  const { prev, at, signals } = scan;
  const edge = (now: boolean, was: boolean | undefined) => now && prev !== null && was === false;
  const made = (kind: LifeSignal['kind'], extra: Partial<LifeSignal> = {}) =>
    signals.push({ kind, member, at, ...extra });
  const whenOld = prev !== null && old;
  const prevAt = prevScanAt(prev, at);
  if (edge(thinking(s, at), whenOld ? thinking(old, prevAt) : false)) made('think.long');
  if (edge(longWorking(s, at), whenOld ? longWorking(old, prevAt) : false)) made('work.long');
  const loop = repeats(s, at);
  if (edge(loop.count >= RETRY_COUNT, whenOld ? repeats(old, prevAt).count >= RETRY_COUNT : false))
    made('retry.loop', { tool: 'Bash', target: loop.target, value: loop.count });
  if (edge(idleLong(s), old ? idleLong(old) : false)) made('idle.long');
  const conflicts = s.git?.conflicts ?? 0;
  if (edge(conflicts > 0, old ? (old.git?.conflicts ?? 0) > 0 : false))
    made('git.conflicts', { value: conflicts });
};

const scanDebt = (
  scan: Scan,
  s: AttributedSession,
  member: string,
  made: (kind: LifeSignal['kind'], extra?: Partial<LifeSignal>) => number,
) => {
  const { at, memory, dirtySince, debtAt } = scan;
  const files = s.git?.uncommitted ?? 0;
  if (files < DEBT_FILES) return;
  const since = memory.dirtySince[member] ?? at;
  dirtySince[member] = since;
  if (at - since >= DEBT_SUSTAIN_MS && at - (debtAt[member] ?? -Infinity) >= DEBT_REPEAT_MS) {
    made('debt.sustained', { value: files });
    debtAt[member] = at;
  }
};

function scanSession(scan: Scan, s: AttributedSession, old: AttributedSession | undefined) {
  const { at, signals } = scan;
  const member = `${LOCAL_PREFIX}${s.key}`;
  const made = (kind: LifeSignal['kind'], extra: Partial<LifeSignal> = {}) =>
    signals.push({ kind, member, at, ...extra });
  const seenUntil = old ? Math.max(0, ...(old.hook?.recent ?? []).map((c) => c.at)) : at - FRESH_MS;
  scanToolStarts(s, member, seenUntil, signals);
  const ended = outcomeSignals({
    member,
    repo: s.worktree?.project ?? s.repo,
    old,
    next: s,
    at,
    seenUntil,
    memory: scan.outcomes,
  });
  signals.push(...ended.signals);
  scan.outcomes = ended.memory;
  scanStateEdges(scan, s, old, member);
  scanDebt(scan, s, member, made);
}

/**
 * Pure and cautious: with no earlier scan nothing that merely "holds" is news (a page load replays no history). A
 * signal says what a command was started as or what state a session is in; how a command ended is said only by a
 * `tool.end`, and only for an outcome the provider stated (see life-outcomes.ts).
 */
export function deriveLifeSignals(
  prev: LifeSnapshot | null,
  next: LifeSnapshot,
  memory: LifeMemory = emptyLifeMemory,
): { signals: LifeSignal[]; memory: LifeMemory } {
  const before = new Map((prev?.sessions ?? []).map((s) => [s.key, s]));
  const scan: Scan = {
    prev,
    at: next.at,
    memory,
    signals: [],
    dirtySince: {},
    debtAt: { ...memory.debtAt },
    outcomes: memory.outcomes,
  };
  const { at, signals, dirtySince, debtAt } = scan;
  for (const s of next.sessions) {
    scanSession(scan, s, before.get(s.key));
  }
  const was = new Map((prev?.agents ?? []).map((a) => [a.id, a.activity]));
  for (const a of next.agents)
    if (a.activity === 'error' && prev !== null && was.has(a.id) && was.get(a.id) !== 'error')
      signals.push({ kind: 'activity.error', member: a.id, at });
  const stillDirty = Object.entries(debtAt).filter(([member]) => member in dirtySince);
  return {
    signals,
    memory: { dirtySince, debtAt: Object.fromEntries(stillDirty), outcomes: scan.outcomes },
  };
}

export const KONAMI = [
  'ArrowUp',
  'ArrowUp',
  'ArrowDown',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowLeft',
  'ArrowRight',
  'b',
  'a',
] as const;

/** How far into the code a key press leaves a person: a wrong key starts over, unless it is the first key again. */
export function konamiStep(progress: number, key: string): number {
  const pressed = key.length === 1 ? key.toLowerCase() : key;
  if (pressed === KONAMI[progress]) return progress + 1;
  return pressed === KONAMI[0] ? 1 : 0;
}
