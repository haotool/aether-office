// The squad's state machine: who sits where, who is arriving or leaving, how big each zone is and how hard the squad works.
// Pure and deterministic: the same state, input and clock give the same next state. Renderers only read it.
import { RATE_WINDOW_MS, squadTokenRate } from './beam-rate.js';

/** What the page knows about one subagent (a subset of what `squadsOf` produces; extra fields are ignored). */
export type SquadMemberInput = {
  id: string;
  type: string;
  status: 'running' | 'waiting_permission' | 'finished' | 'unknown';
  startedAt: number | null;
  lastSeen: number;
  toolCount: number;
  /** Tokens per minute from the subagent's transcript (Claude only); null or absent when no sample exists. */
  tokensPerMinute?: number | null;
  /** When it last started a tool (the hook's PreToolUse time); a change is a jerk of its puppet strings. */
  toolAt?: number | null;
  /** What it handed back, when it finished: only `error` is read (true: the result is flagged as an error). */
  result?: { error: boolean | null } | null;
};
export type SquadInput = { supervisor: string; members: readonly SquadMemberInput[] };

type SquadPhase = 'arriving' | 'seated' | 'leaving';
export type SquadMemberState = {
  id: string;
  supervisor: string;
  type: string;
  /** Index into the zone's pods; stable for as long as the member holds it. */
  seat: number;
  phase: SquadPhase;
  /** Wall clock, ms: when the phase began. Poses are pure functions of `now - since`. */
  since: number;
  /** When a leaving member is out of the office. */
  until: number;
  working: boolean;
  waiting: boolean;
  toolCount: number;
  toolAt: number | null;
};
export type SquadZoneState = {
  /** Seats the zone is sized for. It grows at once and shrinks only after a quiet spell. */
  seats: number;
  /** When the need last differed from `seats` (the start of the quiet spell is the moment it stopped differing). */
  since: number;
  /** Tool starts in the last minute (the beam's fallback rate); oldest first. */
  events: readonly number[];
  /** Tokens per minute of the working members that have a sample (the beam's rate); null when none has one. */
  tokensPerMinute: number | null;
};
export type SquadState = {
  ready: boolean;
  members: Readonly<Record<string, SquadMemberState>>;
  zones: Readonly<Record<string, SquadZoneState>>;
};
type SquadStep = {
  squads: readonly SquadInput[];
  /** How long a member that starts leaving now takes to be out (its errand), in ms. `fact` is what the page knows of it. */
  leaveMs: (id: string, fact: SquadMemberInput | undefined) => number;
};

export const EMPTY_SQUAD: SquadState = { ready: false, members: {}, zones: {} };
/** The longest an arrival takes: the walk is sped up to fit, then the turn and the sit. */
export const ARRIVE_MS = 6000;
/** A subagent that started longer ago than this was there before we looked: it is seated, not walked in. */
const FRESH_MS = 30_000;
/** The zone shrinks only after this long without a change. */
export const SHRINK_AFTER_MS = 10_000;
/** A subagent that has run a tool this recently is working. */
const LIVE_MS = 20_000;
/** A leaving member gives its pod up this long after it begins to leave (it has stood and waved by then). */
export const POD_FREE_MS = 3250;
const MAX_EVENTS = 120;

/** Whether the member still holds its pod: a leaver gives it up once it has stood and waved. */
export const occupies = (m: SquadMemberState, now: number) =>
  m.phase !== 'leaving' || now - m.since < POD_FREE_MS;

function lowestFree(taken: ReadonlySet<number>): number {
  let seat = 0;
  while (taken.has(seat)) seat++;
  return seat;
}

/** The next state of the squads, given the page's facts. */
export function stepSquad(prev: SquadState, input: SquadStep, now: number): SquadState {
  const members: Record<string, SquadMemberState> = {};
  const seenIds = new Set<string>();
  const taken = new Map<string, Set<number>>();
  const hold = (m: SquadMemberState) => {
    if (!occupies(m, now)) return;
    const set = taken.get(m.supervisor) ?? new Set<number>();
    set.add(m.seat);
    taken.set(m.supervisor, set);
  };
  const events = new Map<string, number[]>();
  const push = (supervisor: string, at: number) => {
    const list = events.get(supervisor) ?? [...(prev.zones[supervisor]?.events ?? [])];
    list.push(at);
    events.set(supervisor, list);
  };

  // Members the page still reports, then (below) those that vanished.
  const facts = new Map<string, SquadMemberInput>();
  for (const squad of input.squads) for (const m of squad.members) facts.set(m.id, m);
  const leave = (m: SquadMemberState): SquadMemberState => ({
    ...m,
    phase: 'leaving',
    since: now,
    until: now + input.leaveMs(m.id, facts.get(m.id)),
    working: false,
    waiting: false,
  });

  for (const old of Object.values(prev.members)) {
    seenIds.add(old.id);
    const fact = facts.get(old.id);
    let next = old;
    if (old.phase === 'leaving') {
      if (now >= old.until) continue; // out of the office
    } else if (!fact || fact.status === 'finished') {
      next = leave(old);
    } else {
      if (fact.toolCount > old.toolCount) push(old.supervisor, now);
      next = {
        ...old,
        phase: old.phase === 'arriving' && now - old.since >= ARRIVE_MS ? 'seated' : old.phase,
        working: now - fact.lastSeen < LIVE_MS,
        waiting: fact.status === 'waiting_permission',
        toolCount: fact.toolCount,
        toolAt: fact.toolAt ?? null,
      };
    }
    members[old.id] = next;
    hold(next);
  }

  // New members take the lowest free seat of their squad. The first look at the page seats everyone where they are.
  for (const squad of input.squads)
    for (const fact of squad.members) {
      if (seenIds.has(fact.id) || fact.status === 'finished') continue;
      const set = taken.get(squad.supervisor) ?? new Set<number>();
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
      members[member.id] = member;
      hold(member);
    }

  // Zones: sized by the highest held seat, grown at once, shrunk after a quiet spell with no walk in flight.
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
  return { ready: true, members, zones };
}

/** The members of one squad, in seat order. */
export const membersOf = (state: SquadState, supervisor: string): SquadMemberState[] =>
  Object.values(state.members)
    .filter((m) => m.supervisor === supervisor)
    .sort((a, b) => a.seat - b.seat || a.since - b.since);
