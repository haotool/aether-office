import type { Agent } from '@aether/contracts';
import { MEMO_LIMIT, memoized } from './memo.js';
import { between, weighted } from './pick.js';
import { seeded } from './seeded.js';
import type { ClipName } from './animal-states.js';
import { currentWork, type WorkFacts } from './screen-layout.js';

/**
 * The behavior director: what a seated member does now and then besides its base clip, picked from a table of weights by
 * what the member is doing (a real fact: state, tool, quiet minutes) and by its own seed, so no two members are in step.
 * Pure: the same (seed, step, history) always gives the same action. The scene only schedules it (use-micro-actions.ts).
 * Actions never claim a result: an idle member does not think, nobody nods at nothing. The clips are the ones the models
 * already have: a yawn is the stretch (its face yawns), a facepalm is the shrug, a pause in typing is the seated pose.
 */
type Activity = Agent['activity'];

/** What a working member is up to: waiting for the model, reading (a look-up tool), or at the keys (an edit, a command). */
export type WorkMode = 'model' | 'reading' | 'working';

const READING = new Set(['read', 'search', 'web']);

export function workMode(facts: WorkFacts | undefined): WorkMode {
  if (!facts) return 'working';
  const work = currentWork(facts);
  if (work.thinking) return 'model';
  return READING.has(work.kind) ? 'reading' : 'working';
}

type Table = Partial<Record<ClipName, number>>;
export const BEHAVIOR_WEIGHTS = {
  idle: { sip: 3, look_around: 3, stretch: 2 },
  'working:model': { thinking: 5, scratch_head: 2, look_around: 2, sip: 2 },
  'working:reading': { nod: 4, look_around: 2, thinking: 2, sip: 1, scratch_head: 1 },
  'working:working': {
    seated_idle: 4,
    sip: 1.5,
    scratch_head: 1,
    look_around: 1,
    thinking: 1,
    stretch: 0.5,
  },
  reviewing: { thinking: 3, nod: 3, look_around: 2, sip: 1 },
  error: { shrug: 3, scratch_head: 1 },
} as const satisfies Record<string, Table>;

/** How long before the next action, in ms: a range per state (a person at the keys fidgets sooner than one at rest). */
const WAIT_MS: Record<keyof typeof BEHAVIOR_WEIGHTS, readonly [number, number]> = {
  idle: [9000, 20000],
  'working:model': [3500, 8000],
  'working:reading': [5000, 11000],
  'working:working': [4500, 10000],
  reviewing: [6000, 13000],
  error: [6000, 12000],
};
/** A pause in typing: the hands come off the keys for about a second. */
const PAUSE_MS = [700, 2200] as const;
/** The last this many actions are not repeated. */
export const COOLDOWN = 2;

/** Each species' habits as multipliers on the table: cats stretch, rabbits stay alert, pandas sip. */
const SPECIES_BIAS: Record<string, Table> = {
  cat: { stretch: 2, sip: 0.6, look_around: 1.2 },
  dog: { look_around: 1.4, stretch: 0.8 },
  rabbit: { look_around: 1.6, scratch_head: 0.8 },
  bear: { stretch: 1.4, look_around: 0.7 },
  panda: { sip: 2, stretch: 1.2 },
  raccoon: { scratch_head: 1.6, look_around: 1.2 },
  otter: { sip: 1.5 },
  fox: { thinking: 1.3 },
};
/** From this long without activity an idle member is drowsy: it yawns more. */
export const LONG_QUIET_MINUTES = 8;

export type BehaviorInput = {
  activity: Activity;
  mode: WorkMode;
  seed: string;
  /** Which action of this member's this is (0, 1, 2...). */
  n: number;
  intensity: 0 | 1 | 2 | 3;
  species: string;
  secondMonitor: boolean;
  quietMinutes: number | null;
  /** The last actions, newest last. */
  recent: readonly ClipName[];
};
type Micro = { clip: ClipName; waitMs: number; holdMs?: number };

function tableKey(activity: Activity, mode: WorkMode): keyof typeof BEHAVIOR_WEIGHTS | null {
  if (activity === 'working') return `working:${mode}`;
  return activity === 'idle' || activity === 'reviewing' || activity === 'error' ? activity : null;
}

export function microAction(input: BehaviorInput): Micro | null {
  const key = tableKey(input.activity, input.mode);
  if (!key) return null;
  const weights: Table = { ...BEHAVIOR_WEIGHTS[key] };
  const bias = SPECIES_BIAS[input.species] ?? {};
  const scale = (clip: ClipName, by: number) => {
    const weight = weights[clip];
    if (weight !== undefined) weights[clip] = weight * by;
  };
  for (const [clip, by] of Object.entries(bias)) scale(clip as ClipName, by);
  if (input.secondMonitor && input.activity === 'working') scale('look_around', 2.8); // a glance at the other screen
  if (input.activity === 'idle' && (input.quietMinutes ?? 0) >= LONG_QUIET_MINUTES) {
    scale('stretch', 4); // a yawn before dozing off
    scale('sip', 0.5);
  }
  scale('sip', 1 - 0.22 * input.intensity);
  scale('seated_idle', 1 + 0.25 * input.intensity);
  const window = Math.min(COOLDOWN, Object.keys(weights).length - 1); // a table of two can only alternate
  for (const clip of input.recent.slice(-window)) delete weights[clip];
  const r = seeded(`${input.seed}:micro:${input.n}`);
  const clip = weighted(r, weights as Record<ClipName, number>);
  const [lo, hi] = WAIT_MS[key];
  const pace = 1 - 0.12 * input.intensity;
  const waitMs = Math.round(between(r, lo, hi) * pace);
  return clip === 'seated_idle'
    ? { clip, waitMs, holdMs: Math.round(between(r, PAUSE_MS[0], PAUSE_MS[1])) }
    : { clip, waitMs };
}

const MAX_YAW = (10 * Math.PI) / 180;
const MAX_LEAN = 0.03;
type Drift = {
  phase: readonly [number, number, number];
  rate: readonly [number, number, number];
};

/** A member's own slow sway: two periods for the chair's turn and one for the lean, each seeded, so neighbours never sway together. */
export const driftParams = memoized(new Map<string, Drift>(), MEMO_LIMIT, (seed: string): Drift => {
  const r = seeded(`${seed}:drift`);
  const tau = Math.PI * 2;
  return {
    phase: [r() * tau, r() * tau, r() * tau],
    rate: [tau / between(r, 25, 45), tau / between(r, 11, 19), tau / between(r, 17, 31)],
  };
});
/** The chair's turn in radians at `t` seconds: within 10 degrees either way. */
export const yawAt = (d: Drift, t: number): number =>
  MAX_YAW *
  (0.62 * Math.sin(t * d.rate[0] + d.phase[0]) + 0.38 * Math.sin(t * d.rate[1] + d.phase[1]));
/** How far the member leans forward or back, in radians at `t` seconds. */
export const leanAt = (d: Drift, t: number): number =>
  MAX_LEAN * Math.sin(t * d.rate[2] + d.phase[2]);
export const driftOf = (seed: string, t: number) => ({
  yaw: yawAt(driftParams(seed), t),
  lean: leanAt(driftParams(seed), t),
});
