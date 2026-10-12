import type { Agent } from '@aether/contracts';
import { seeded } from '../environment/seeded.js';

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

export function transitionClip(previous: Activity | null, next: Activity): ClipName | null {
  if ((previous === 'working' || previous === 'reviewing') && next === 'idle') return 'cheer';
  if (previous === 'waiting_permission' && next === 'working') return 'nod';
  if (previous !== null && previous !== 'error' && next === 'error') return 'shrug';
  return null;
}

export function greets(activity: Activity): boolean {
  return activity === 'idle' || activity === 'working' || activity === 'reviewing';
}

export function startPhase(seed: string): number {
  return seeded(`${seed}:phase`)();
}

export type Apparition = 'sleeping_rabbit' | 'ghost' | 'zombie';
type LivenessName = 'active' | 'idle' | 'dormant' | 'orphaned' | 'ended' | 'unknown';

export function apparitionOf(state: LivenessName): Exclude<Apparition, 'zombie'> | null {
  return state === 'dormant' ? 'sleeping_rabbit' : state === 'orphaned' ? 'ghost' : null;
}

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
