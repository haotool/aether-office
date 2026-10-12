import type { AttributedSession } from '@aether/contracts';
import type { LifeSignal } from '@aether/office-scene/model';

type Call = NonNullable<AttributedSession['hook']>['recent'][number];

const MACHINE_MS = 30 * 60_000;
const FIX_MS = 20 * 60_000;
const FRESH_MS = 30_000;
const EDITS = new Set(['Edit', 'Write', 'MultiEdit']);
const TEST_FILE = /\.(test|spec)\./i;

type TestRun = { member: string; repo: string; ok: boolean; at: number };
type Fixing = { failAt: number; editedAt: number | null };
export type OutcomeMemory = {
  tests: readonly TestRun[];
  fixing: Readonly<Record<string, Fixing>>;
};
export const emptyOutcomes: OutcomeMemory = { tests: [], fixing: {} };

const isTest = (c: Call) => c.tags.includes('test');
const settled = (c: Call) => c.ok === true || c.ok === false;
const callKey = (c: Call) => `${c.tool}|${c.at}`;

type Event = { kind: 'edit'; at: number } | { kind: 'test'; at: number; ok: boolean };

function settledEvents(
  input: {
    member: string;
    old: AttributedSession | undefined;
    next: AttributedSession;
    at: number;
    seenUntil: number;
  },
  signals: LifeSignal[],
): Event[] {
  const { member, old, next, at, seenUntil } = input;
  const own = (s: AttributedSession) => (s.hook?.recent ?? []).filter((c) => !c.agentId);
  const known = new Map((old ? own(old) : []).map((c) => [callKey(c), c.ok]));
  const events: Event[] = [];
  for (const c of own(next)) {
    const before = known.get(callKey(c));
    const justSettled = settled(c) && before !== true && before !== false;
    if (justSettled && (old || at - c.at <= FRESH_MS))
      signals.push({
        kind: 'tool.end',
        member,
        at,
        tool: c.tool,
        target: c.target,
        ok: c.ok,
        ...(c.tags.length ? { tags: c.tags } : {}),
      });
    if (justSettled && isTest(c) && (old || at - c.at <= FRESH_MS))
      events.push({ kind: 'test', at: c.at, ok: c.ok === true });
    if (c.at > seenUntil && EDITS.has(c.tool) && TEST_FILE.test(c.target ?? ''))
      events.push({ kind: 'edit', at: c.at });
  }
  return events;
}

const applyTestEvent = (
  e: Extract<Event, { kind: 'test' }>,
  ctx: {
    member: string;
    repo: string;
    at: number;
    signals: LifeSignal[];
    tests: TestRun[];
    fixing: Record<string, Fixing>;
  },
) => {
  const { member, repo, at, signals, fixing } = ctx;
  const failed = fixing[member];
  const other = ctx.tests.find((t) => t.repo === repo && t.member !== member && t.ok !== e.ok);
  if (other)
    signals.push({ kind: 'tests.machine', member: e.ok ? other.member : member, at, ok: false });
  ctx.tests = [
    ...ctx.tests.filter((t) => t.member !== member),
    { member, repo, ok: e.ok, at: e.at },
  ];
  if (!e.ok) fixing[member] = { failAt: e.at, editedAt: null };
  else {
    if (failed?.editedAt != null && e.at - failed.failAt <= FIX_MS)
      signals.push({ kind: 'tests.edited', member, at, ok: true });
    delete fixing[member];
  }
};

const applyEditEvent = (
  e: Extract<Event, { kind: 'edit' }>,
  member: string,
  fixing: Record<string, Fixing>,
) => {
  const failed = fixing[member];
  if (failed && e.at > failed.failAt) fixing[member] = { ...failed, editedAt: e.at };
};

const pruneFixing = (fixing: Record<string, Fixing>, at: number) => {
  for (const [key, f] of Object.entries(fixing)) if (at - f.failAt > FIX_MS) delete fixing[key];
};

export function outcomeSignals(input: {
  member: string;
  repo: string;
  old: AttributedSession | undefined;
  next: AttributedSession;
  at: number;
  seenUntil: number;
  memory: OutcomeMemory;
}): { signals: LifeSignal[]; memory: OutcomeMemory } {
  const { member, repo, at } = input;
  const signals: LifeSignal[] = [];
  const events = settledEvents(input, signals);
  const ctx = {
    member,
    repo,
    at,
    signals,
    tests: input.memory.tests.filter((t) => at - t.at < MACHINE_MS),
    fixing: { ...input.memory.fixing },
  };
  for (const e of events.sort((a, b) => a.at - b.at)) {
    if (e.kind === 'edit') applyEditEvent(e, member, ctx.fixing);
    else applyTestEvent(e, ctx);
  }
  pruneFixing(ctx.fixing, at);
  return { signals, memory: { tests: ctx.tests, fixing: ctx.fixing } };
}
