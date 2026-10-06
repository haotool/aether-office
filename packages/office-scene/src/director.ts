import type { Agent } from '@aether/contracts';

/**
 * The director: which agent, pair or floor the camera should be on next. Pure: it reads the state of the office and
 * returns a shot; nothing here moves a camera (see shot-camera.ts) or draws (see CommLinks.tsx).
 *
 * What makes a shot worth cutting to, most first: two agents talking, someone waiting on a human or in error, someone
 * working or reviewing, someone starting. Within a class, whoever has not been on screen for longest goes first, so
 * every active agent is seen in turn. With nothing going on it sweeps a floor.
 */
export type Seat = { x: number; z: number; floor: number; rotation: number };
export type PulseKind = 'inform' | 'request' | 'decision' | 'handoff' | 'sub';
/** One agent reaching another: a message, or a subagent at work for its parent. */
export type Pulse = { id: string; from: string; to: string; kind: PulseKind; at: number };
export type ShotReason =
  'message' | 'approval' | 'error' | 'working' | 'review' | 'peer' | 'attention' | 'sweep';
export type Shot = {
  key: string;
  kind: 'closeup' | 'pair' | 'sweep';
  floor: number;
  /** One agent for a closeup, sender then recipient for a pair, none for a sweep. */
  subjects: string[];
  reason: ShotReason;
  seconds: number;
  score: number;
  /** Which camera move: 0 over the shoulder, 1 profile, 2 crane. Stable for a given shot. */
  style: 0 | 1 | 2;
  /** The pulse behind a pair shot. */
  pulse?: Pulse;
};

/** How long a message or subagent exchange stays worth showing. */
export const PULSE_WINDOW_MS = 20_000;
const SCORE: Record<Agent['activity'], { score: number; reason: ShotReason }> = {
  waiting_permission: { score: 90, reason: 'approval' },
  error: { score: 80, reason: 'error' },
  working: { score: 60, reason: 'working' },
  reviewing: { score: 55, reason: 'review' },
  waiting_peer: { score: 50, reason: 'peer' },
  starting: { score: 40, reason: 'working' },
  idle: { score: 6, reason: 'working' },
  unknown: { score: 2, reason: 'working' },
  offline: { score: 0, reason: 'working' },
};
// Long enough to take a shot in and to read its caption; a shot is one slow move (see shot-camera.ts), not a tour.
const SECONDS = { pair: 9, closeup: 8, sweep: 12 } as const;
/** A member, pair or floor just shown is not shown again for this long, unless it wants a person at once. */
export const COOLDOWN_MS = 30_000;
const URGENT: readonly ShotReason[] = ['approval', 'error'];
const NEEDS_A_REASON = 30; // below this nothing is worth a closeup: sweep instead

/**
 * The more members are busy at once, the shorter a shot: with five agents working, eight seconds on each is most of a
 * minute before the last one is seen. Down to 70% of the length, never faster than a person can read the caption.
 */
export function pacedSeconds(seconds: number, agents: readonly Agent[]): number {
  const busy = agents.filter((a) => SCORE[a.activity].score >= 50).length;
  return Math.round(seconds * Math.max(0.7, 1 - 0.06 * Math.max(0, busy - 1)) * 10) / 10;
}

const hash = (text: string) => {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
};

export function chooseShot({
  agents,
  seats,
  pulses,
  attention,
  intensity,
  now,
  shown,
  previous,
}: {
  agents: readonly Agent[];
  seats: ReadonlyMap<string, Seat>;
  pulses: readonly Pulse[];
  /** Members that want a person (forgotten, ownerless, zombies under them), by id with the reason. */
  attention?: ReadonlyMap<string, string>;
  /** How hard each working member works (0 to 3): the busiest are on screen more. */
  intensity?: ReadonlyMap<string, number>;
  now: number;
  /** When each shot key (an agent id, "a>b", "floor:n") last went on screen. */
  shown: ReadonlyMap<string, number>;
  previous: Shot | null;
}): Shot | null {
  const candidates: Shot[] = [];
  // Seconds since the key was last shown (a never-shown key counts as a minute), turned into a bonus and, for the
  // last few seconds, a penalty: the shot just taken is not taken again at once.
  const freshness = (key: string) => {
    const since = (now - (shown.get(key) ?? now - 60_000)) / 1000;
    return since < 12 ? -50 : Math.min(30, since * 1.5);
  };
  const byId = new Map(agents.map((a) => [a.id, a]));

  for (const pulse of pulses) {
    const age = now - pulse.at;
    const from = seats.get(pulse.from);
    const to = seats.get(pulse.to);
    if (age > PULSE_WINDOW_MS || age < -5000 || !from || !to || !byId.has(pulse.from)) continue;
    const key = `${pulse.from}>${pulse.to}`;
    const kindBonus =
      pulse.kind === 'decision' || pulse.kind === 'handoff' ? 10 : pulse.kind === 'sub' ? -15 : 0;
    const same = from.floor === to.floor;
    candidates.push({
      key,
      kind: same ? 'pair' : 'closeup',
      floor: from.floor,
      subjects: same ? [pulse.from, pulse.to] : [pulse.from],
      reason: 'message',
      seconds: same ? SECONDS.pair : SECONDS.closeup,
      score: 120 - (age / 1000) * 3 + kindBonus + freshness(key) * 0.5,
      style: (hash(key) % 3) as 0 | 1 | 2,
      pulse,
    });
  }
  for (const agent of agents) {
    const seat = seats.get(agent.id);
    const rule = SCORE[agent.activity];
    if (!seat || rule.score < 20) continue; // someone idle is not a shot
    candidates.push({
      key: agent.id,
      kind: 'closeup',
      floor: seat.floor,
      subjects: [agent.id],
      reason: rule.reason,
      seconds: SECONDS.closeup,
      score: rule.score + freshness(agent.id) + (intensity?.get(agent.id) ?? 0) * 6,
      style: (hash(agent.id + (shown.size % 7)) % 3) as 0 | 1 | 2,
    });
  }
  // Those that want a person are worth a look between the busy ones: below work, above nothing.
  for (const id of attention?.keys() ?? []) {
    const seat = seats.get(id);
    if (!seat || !byId.has(id)) continue;
    candidates.push({
      key: `attention:${id}`,
      kind: 'closeup',
      floor: seat.floor,
      subjects: [id],
      reason: 'attention',
      seconds: SECONDS.closeup,
      score: 36 + freshness(`attention:${id}`) * 0.4,
      style: (hash(id) % 3) as 0 | 1 | 2,
    });
  }
  // Not back to a subject so soon: the camera does not keep returning to the same desk (and then the same two members).
  const cooling = (c: Shot) =>
    !URGENT.includes(c.reason) &&
    [c.key, ...c.subjects].some((key) => now - (shown.get(key) ?? -Infinity) < COOLDOWN_MS);
  const fresh = candidates.filter((c) => !cooling(c));
  fresh.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  const best = fresh[0];
  if (best && best.score >= NEEDS_A_REASON)
    return { ...best, seconds: pacedSeconds(best.seconds, agents) };

  // Nothing to watch: sweep the floor with the most people on it, a different one each time.
  const crowd = new Map<number, number>();
  for (const seat of seats.values()) crowd.set(seat.floor, (crowd.get(seat.floor) ?? 0) + 1);
  const floors = [...crowd].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([floor]) => floor);
  if (!floors.length) return null;
  const floor =
    floors.find((f) => `floor:${f}` !== previous?.key && freshness(`floor:${f}`) > 0) ??
    floors.find((f) => `floor:${f}` !== previous?.key) ??
    floors[0]!;
  return {
    key: `floor:${floor}`,
    kind: 'sweep',
    floor,
    subjects: [],
    reason: 'sweep',
    seconds: SECONDS.sweep,
    score: 20,
    // Another bearing each time, so a floor swept twice running is not the same picture.
    style: ((hash(`floor:${floor}`) + shown.size) % 3) as 0 | 1 | 2,
  };
}
