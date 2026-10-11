import { RATE_WINDOW_MS, squadTokenRate } from './beam-rate.js';

export type SquadMemberInput = {
  id: string;
  type: string;
  status: 'running' | 'waiting_permission' | 'finished' | 'unknown';
  startedAt: number | null;
  lastSeen: number;
  toolCount: number;
  tokensPerMinute?: number | null;
  toolAt?: number | null;
  result?: { error: boolean | null } | null;
};
export type SquadInput = { supervisor: string; members: readonly SquadMemberInput[] };

type SquadPhase = 'arriving' | 'seated' | 'leaving';
export type SquadMemberState = {
  id: string;
  supervisor: string;
  type: string;
  seat: number;
  phase: SquadPhase;
  /** Wall clock, ms: when the phase began. Poses are pure functions of `now - since`. */
  since: number;
  until: number;
  working: boolean;
  waiting: boolean;
  toolCount: number;
  toolAt: number | null;
};
export type SquadZoneState = {
  seats: number;
  since: number;
  events: readonly number[];
  tokensPerMinute: number | null;
};
export type SquadState = {
  ready: boolean;
  members: Readonly<Record<string, SquadMemberState>>;
  zones: Readonly<Record<string, SquadZoneState>>;
};
type SquadStep = {
  squads: readonly SquadInput[];
  leaveMs: (id: string, fact: SquadMemberInput | undefined) => number;
};

export const EMPTY_SQUAD: SquadState = { ready: false, members: {}, zones: {} };
export const ARRIVE_MS = 6000;
const FRESH_MS = 30_000;
export const SHRINK_AFTER_MS = 10_000;
const LIVE_MS = 20_000;
export const POD_FREE_MS = 3250;
const MAX_EVENTS = 120;

export const occupies = (m: SquadMemberState, now: number) =>
  m.phase !== 'leaving' || now - m.since < POD_FREE_MS;

function lowestFree(taken: ReadonlySet<number>): number {
  let seat = 0;
  while (taken.has(seat)) seat++;
  return seat;
}

type Ledger = {
  members: Record<string, SquadMemberState>;
  taken: Map<string, Set<number>>;
  events: Map<string, number[]>;
};

function hold(ledger: Ledger, m: SquadMemberState, now: number) {
  if (!occupies(m, now)) return;
  const set = ledger.taken.get(m.supervisor) ?? new Set<number>();
  set.add(m.seat);
  ledger.taken.set(m.supervisor, set);
}

function pushEvent(ledger: Ledger, prev: SquadState, supervisor: string, at: number) {
  const list = ledger.events.get(supervisor) ?? [...(prev.zones[supervisor]?.events ?? [])];
  list.push(at);
  ledger.events.set(supervisor, list);
}

function settleMembers(
  prev: SquadState,
  input: SquadStep,
  now: number,
  facts: ReadonlyMap<string, SquadMemberInput>,
  ledger: Ledger,
) {
  const leave = (m: SquadMemberState): SquadMemberState => ({
    ...m,
    phase: 'leaving',
    since: now,
    until: now + input.leaveMs(m.id, facts.get(m.id)),
    working: false,
    waiting: false,
  });
  for (const old of Object.values(prev.members)) {
    const fact = facts.get(old.id);
    let next = old;
    if (old.phase === 'leaving') {
      if (now >= old.until) continue;
    } else if (!fact || fact.status === 'finished') {
      next = leave(old);
    } else {
      if (fact.toolCount > old.toolCount) pushEvent(ledger, prev, old.supervisor, now);
      next = {
        ...old,
        phase: old.phase === 'arriving' && now - old.since >= ARRIVE_MS ? 'seated' : old.phase,
        working: now - fact.lastSeen < LIVE_MS,
        waiting: fact.status === 'waiting_permission',
        toolCount: fact.toolCount,
        toolAt: fact.toolAt ?? null,
      };
    }
    ledger.members[old.id] = next;
    hold(ledger, next, now);
  }
}

function seatNewcomers(prev: SquadState, input: SquadStep, now: number, ledger: Ledger) {
  for (const squad of input.squads)
    for (const fact of squad.members) {
      if (prev.members[fact.id] || fact.status === 'finished') continue;
      const set = ledger.taken.get(squad.supervisor) ?? new Set<number>();
      const recent = fact.startedAt === null || now - fact.startedAt < FRESH_MS;
      const arriving = prev.ready && recent;
      const member: SquadMemberState = {
        id: fact.id,
        supervisor: squad.supervisor,
        type: fact.type,
        seat: lowestFree(set),
        phase: arriving ? 'arriving' : 'seated',
        since: arriving ? now : (fact.startedAt ?? now),
        until: 0,
        working: now - fact.lastSeen < LIVE_MS,
        waiting: fact.status === 'waiting_permission',
        toolCount: fact.toolCount,
        toolAt: fact.toolAt ?? null,
      };
      ledger.members[member.id] = member;
      hold(ledger, member, now);
    }
}

function sizeZones(
  prev: SquadState,
  input: SquadStep,
  now: number,
  ledger: Ledger,
): Record<string, SquadZoneState> {
  const { members, taken, events } = ledger;
  const zones: Record<string, SquadZoneState> = {};
  const supervisors = new Set([
    ...Object.keys(prev.zones),
    ...Object.values(members).map((m) => m.supervisor),
  ]);
  for (const supervisor of supervisors) {
    const need = Math.max(-1, ...(taken.get(supervisor) ?? [])) + 1;
    const old = prev.zones[supervisor];
    const walking = Object.values(members).some(
      (m) => m.supervisor === supervisor && m.phase !== 'seated',
    );
    let seats = old?.seats ?? need;
    let since = old?.since ?? now;
    if (need > seats) {
      seats = need;
      since = now;
    } else if (need === seats) since = now;
    else if (now - since >= SHRINK_AFTER_MS && !walking) {
      seats = need;
      since = now;
    }
    const recent = (events.get(supervisor) ?? old?.events ?? []).filter(
      (at) => now - at < RATE_WINDOW_MS,
    );
    if (seats === 0 && recent.length === 0) continue;
    zones[supervisor] = {
      seats,
      since,
      events: recent.slice(-MAX_EVENTS),
      tokensPerMinute: squadTokenRate(
        input.squads.find((q) => q.supervisor === supervisor)?.members ?? [],
      ),
    };
  }
  return zones;
}

export function stepSquad(prev: SquadState, input: SquadStep, now: number): SquadState {
  const ledger: Ledger = { members: {}, taken: new Map(), events: new Map() };
  const facts = new Map<string, SquadMemberInput>();
  for (const squad of input.squads) for (const m of squad.members) facts.set(m.id, m);
  settleMembers(prev, input, now, facts, ledger);
  seatNewcomers(prev, input, now, ledger);
  return { ready: true, members: ledger.members, zones: sizeZones(prev, input, now, ledger) };
}

export const membersOf = (state: SquadState, supervisor: string): SquadMemberState[] =>
  Object.values(state.members)
    .filter((m) => m.supervisor === supervisor)
    .sort((a, b) => a.seat - b.seat || a.since - b.since);
