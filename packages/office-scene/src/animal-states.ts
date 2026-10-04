import type { Agent } from '@aether/contracts';
import { seeded } from './screens.js';

/** Every clip an animal model carries (tools/blender/animal_clips.py, checked by scripts/validate-assets.mjs). */
export const CLIPS = [
  'idle',
  'walk',
  'turn',
  'sit_down',
  'stand_up',
  'seated_idle',
  'typing',
  'reading',
  'thinking',
  'scratch_head',
  'reviewing',
  'testing',
  'waiting_permission',
  'waiting_peer',
  'error',
  'cheer',
  'celebrate',
  'sleeping',
  'stretch',
  'sip',
  'wave',
  'shrug',
  'look_around',
  'nod',
] as const;
export type ClipName = (typeof CLIPS)[number];
type Activity = Agent['activity'];

/** What each activity looks like while it lasts. */
export const BASE_CLIP = {
  idle: 'seated_idle',
  starting: 'stretch',
  working: 'typing',
  reviewing: 'reviewing',
  waiting_permission: 'waiting_permission',
  waiting_peer: 'waiting_peer',
  error: 'error',
  offline: 'sleeping',
  unknown: 'shrug',
} as const satisfies Record<Activity, ClipName>;

/**
 * Small gestures an animal makes now and then while it is in a state, so a long wait is not a frozen pose. They only
 * ever show a person taking a moment (never a decision, a result or a message): an idle member does not "think".
 */
const FIDGETS: Partial<Record<Activity, readonly ClipName[]>> = {
  idle: ['stretch', 'sip', 'look_around'],
  working: ['thinking', 'scratch_head', 'sip', 'look_around'],
  reviewing: ['thinking', 'look_around', 'sip'],
};

export const FIDGET_MIN_MS = 7000;
export const FIDGET_SPREAD_MS = 9000;

/** The nth gesture for this member in this state, or null when the state has none. Deterministic per member. */
export function fidgetFor(activity: Activity, seed: string, n: number): ClipName | null {
  const choices = FIDGETS[activity];
  if (!choices) return null;
  return choices[Math.floor(seeded(`${seed}:fidget:${n}`)() * choices.length)]!;
}

/** How long to wait before the nth gesture. */
export function fidgetDelayMs(seed: string, n: number): number {
  return FIDGET_MIN_MS + Math.floor(seeded(`${seed}:wait:${n}`)() * FIDGET_SPREAD_MS);
}

/** A real change of activity worth marking: finishing work earns a cheer, an approval a nod of thanks. */
export function transitionClip(previous: Activity | null, next: Activity): ClipName | null {
  if ((previous === 'working' || previous === 'reviewing') && next === 'idle') return 'cheer';
  if (previous === 'waiting_permission' && next === 'working') return 'nod';
  return null;
}

/** States in which a greeting wave would not be out of place. */
export function greets(activity: Activity): boolean {
  return activity === 'idle' || activity === 'working' || activity === 'reviewing';
}

/** Where in its clip an animal starts, so a row of members is not in lockstep. */
export function startPhase(seed: string): number {
  return seeded(`${seed}:phase`)();
}

/**
 * A session that is alive in a way an owner should notice is drawn as something else, at its own seat. Two take the
 * member's place: a rabbit asleep for a session forgotten for hours, and a ghost for one nobody owns any more. A third
 * is added to it: a jiangshi (a hopping corpse) standing behind the chair for each session with zombie processes under
 * it, the finished children that nobody collected.
 */
export type Apparition = 'sleeping_rabbit' | 'ghost' | 'zombie';
export type LivenessName = 'active' | 'idle' | 'dormant' | 'orphaned' | 'ended' | 'unknown';

/** What replaces the member, if anything. */
export function apparitionOf(state: LivenessName): Exclude<Apparition, 'zombie'> | null {
  return state === 'dormant' ? 'sleeping_rabbit' : state === 'orphaned' ? 'ghost' : null;
}

/** The model file's name (animals are named for their species) and the one clip each apparition plays. */
export const APPARITION_MODEL = {
  sleeping_rabbit: 'rabbit',
  ghost: 'ghost',
  zombie: 'zombie',
} as const;
export const APPARITION_CLIP = {
  sleeping_rabbit: 'sleeping',
  ghost: 'haunt',
  zombie: 'hop',
} as const;
