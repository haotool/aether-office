import type { AttributedSession } from '@aether/contracts';
import type { LifeSignal } from '@aether/office-scene/model';

type Call = NonNullable<AttributedSession['hook']>['recent'][number];

/** How long a test result of another session counts as "the same time" for the works-on-my-machine sticker. */
const MACHINE_MS = 30 * 60_000;
/** A failed run, an edited test file and a pass within this long make "not a bug, a feature". */
const FIX_MS = 20 * 60_000;
/** A call seen for the first time at page load counts only if it is this fresh (the scheduler drops older news too). */
const FRESH_MS = 30_000;
const EDITS = new Set(['Edit', 'Write', 'MultiEdit']);
const TEST_FILE = /\.(test|spec)\./i;

/** A test run's real outcome, kept for the cross-session pairing. */
type TestRun = { member: string; repo: string; ok: boolean; at: number };
/** A session whose tests failed: since when, and when a test file was edited after that (null: not yet). */
type Fixing = { failAt: number; editedAt: number | null };
/** What the outcome deriver remembers between scans. */
export type OutcomeMemory = {
  tests: readonly TestRun[];
  fixing: Readonly<Record<string, Fixing>>;
};
export const emptyOutcomes: OutcomeMemory = { tests: [], fixing: {} };

const isTest = (c: Call) => c.tags.includes('test');
const settled = (c: Call) => c.ok === true || c.ok === false;
const callKey = (c: Call) => `${c.tool}|${c.at}`;

type Event = { kind: 'edit'; at: number } | { kind: 'test'; at: number; ok: boolean };

/** The calls that settled since the earlier scan, as signals (`tool.end`) and as the test and edit events the patterns are made of. */
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

/**
 * The outcome signals one session's change between two scans makes. A call whose real outcome (`ok`) is newly known gives
 * a `tool.end`; a test outcome also feeds two patterns that are made only of real calls: the same repo failing in one session
 * while another passed (`tests.machine`, on the failing member), and a failed run followed by an edit to a test file and then a
 * pass (`tests.edited`). A call whose outcome is not known gives nothing here. Pure.
 */
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
  /** The newest call time of the previous scan (or, for a session not seen before, just before the fresh window). */
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
