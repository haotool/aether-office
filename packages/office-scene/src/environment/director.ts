import type { Agent } from '@aether/contracts';
import { hashText } from './hash.js';

export type Seat = { x: number; z: number; floor: number; rotation: number };
export type PulseKind = 'inform' | 'request' | 'decision' | 'handoff' | 'sub';
export type Pulse = { id: string; from: string; to: string; kind: PulseKind; at: number };
type ShotReason =
  'message' | 'approval' | 'error' | 'working' | 'review' | 'peer' | 'attention' | 'sweep';
export type Shot = {
  key: string;
  kind: 'closeup' | 'pair' | 'sweep';
  floor: number;
  subjects: string[];
  reason: ShotReason;
  seconds: number;
  score: number;
  style: 0 | 1 | 2;
  pulse?: Pulse;
};

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
const SECONDS = { pair: 9, closeup: 8, sweep: 12 } as const;
export const COOLDOWN_MS = 30_000;
const URGENT: readonly ShotReason[] = ['approval', 'error'];
const NEEDS_A_REASON = 30;

/**
 * The more members are busy at once, the shorter a shot, down to 70% of the length and never faster than a person can
 * read the caption.
 */
export function pacedSeconds(seconds: number, agents: readonly Agent[]): number {
  const busy = agents.filter((a) => SCORE[a.activity].score >= 50).length;
  return Math.round(seconds * Math.max(0.7, 1 - 0.06 * Math.max(0, busy - 1)) * 10) / 10;
}

type ShotInput = {
  agents: readonly Agent[];
  seats: ReadonlyMap<string, Seat>;
  pulses: readonly Pulse[];
  attention?: ReadonlyMap<string, string>;
  intensity?: ReadonlyMap<string, number>;
  now: number;
  shown: ReadonlyMap<string, number>;
  previous: Shot | null;
};
type Freshness = (key: string) => number;
type Style = 0 | 1 | 2;

function messageShots({ agents, seats, pulses, now }: ShotInput, freshness: Freshness): Shot[] {
  const byId = new Set(agents.map((a) => a.id));
  const shots: Shot[] = [];
  for (const pulse of pulses) {
    const age = now - pulse.at;
    const from = seats.get(pulse.from);
    const to = seats.get(pulse.to);
    if (
      age > PULSE_WINDOW_MS ||
      age < -5000 ||
      !from ||
      !to ||
      !byId.has(pulse.from) ||
      !byId.has(pulse.to)
    )
      continue;
    const key = `${pulse.from}>${pulse.to}`;
    const kindBonus =
      pulse.kind === 'decision' || pulse.kind === 'handoff' ? 10 : pulse.kind === 'sub' ? -15 : 0;
    const same = from.floor === to.floor;
    shots.push({
      key,
      kind: same ? 'pair' : 'closeup',
      floor: from.floor,
      subjects: same ? [pulse.from, pulse.to] : [pulse.from],
      reason: 'message',
      seconds: same ? SECONDS.pair : SECONDS.closeup,
      score: 120 - (age / 1000) * 3 + kindBonus + freshness(key) * 0.5,
      style: (hashText(key) % 3) as Style,
      pulse,
    });
  }
  return shots;
}

function activityShots(
  { agents, seats, intensity, shown }: ShotInput,
  freshness: Freshness,
): Shot[] {
  const shots: Shot[] = [];
  for (const agent of agents) {
    const seat = seats.get(agent.id);
    const rule = SCORE[agent.activity];
    if (!seat || rule.score < 20) continue;
    shots.push({
      key: agent.id,
      kind: 'closeup',
      floor: seat.floor,
      subjects: [agent.id],
      reason: rule.reason,
      seconds: SECONDS.closeup,
      score: rule.score + freshness(agent.id) + (intensity?.get(agent.id) ?? 0) * 6,
      style: (hashText(agent.id + (shown.size % 7)) % 3) as Style,
    });
  }
  return shots;
}

function attentionShots({ agents, seats, attention }: ShotInput, freshness: Freshness): Shot[] {
  const byId = new Set(agents.map((a) => a.id));
  const shots: Shot[] = [];
  for (const id of attention?.keys() ?? []) {
    const seat = seats.get(id);
    if (!seat || !byId.has(id)) continue;
    shots.push({
      key: `attention:${id}`,
      kind: 'closeup',
      floor: seat.floor,
      subjects: [id],
      reason: 'attention',
      seconds: SECONDS.closeup,
      score: 36 + freshness(`attention:${id}`) * 0.4,
      style: (hashText(id) % 3) as Style,
    });
  }
  return shots;
}

function sweepShot(
  { agents, seats, shown, previous }: ShotInput,
  freshness: Freshness,
): Shot | null {
  const crowd = new Map<number, number>();
  for (const agent of agents) {
    const seat = seats.get(agent.id);
    if (seat) crowd.set(seat.floor, (crowd.get(seat.floor) ?? 0) + 1);
  }
  const floors = [...crowd].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([floor]) => floor);
  const [busiest] = floors;
  if (busiest === undefined) return null;
  const floor =
    floors.find((f) => `floor:${f}` !== previous?.key && freshness(`floor:${f}`) > 0) ??
    floors.find((f) => `floor:${f}` !== previous?.key) ??
    busiest;
  return {
    key: `floor:${floor}`,
    kind: 'sweep',
    floor,
    subjects: agents.filter((a) => seats.get(a.id)?.floor === floor).map((a) => a.id),
    reason: 'sweep',
    seconds: SECONDS.sweep,
    score: 20,
    style: ((hashText(`floor:${floor}`) + shown.size) % 3) as Style,
  };
}

export function chooseShot(input: ShotInput): Shot | null {
  const { agents, now, shown } = input;
  const freshness: Freshness = (key) => {
    const since = (now - (shown.get(key) ?? now - 60_000)) / 1000;
    return since < 12 ? -50 : Math.min(30, since * 1.5);
  };
  const candidates = [
    ...messageShots(input, freshness),
    ...activityShots(input, freshness),
    ...attentionShots(input, freshness),
  ];
  const cooling = (c: Shot) =>
    !URGENT.includes(c.reason) &&
    [c.key, ...c.subjects].some((key) => now - (shown.get(key) ?? -Infinity) < COOLDOWN_MS);
  const fresh = candidates.filter((c) => !cooling(c));
  fresh.sort((a, b) => b.score - a.score || (a.key < b.key ? -1 : 1));
  const best = fresh[0];
  if (best && best.score >= NEEDS_A_REASON)
    return { ...best, seconds: pacedSeconds(best.seconds, agents) };
  return sweepShot(input, freshness);
}
