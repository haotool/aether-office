import { useSyncExternalStore } from 'react';
import type { LifeMoment } from '@aether/office-scene/model';

// The last few little moments the 3D office showed for each member, kept in memory for the conversation header's "recent
// moments" chip. Decorative, never persisted, and gone with the page.

/** Moments kept per member. */
export const MOMENTS_PER_MEMBER = 5;
/** Members kept: the oldest member's list goes first. */
const MEMBERS_KEPT = 40;

let byMember: ReadonlyMap<string, readonly LifeMoment[]> = new Map();
const listeners = new Set<() => void>();

/** Newest first. Pure: the same list and moment give the same next list. */
export const withMoment = (list: readonly LifeMoment[], moment: LifeMoment): LifeMoment[] =>
  [moment, ...list].slice(0, MOMENTS_PER_MEMBER);

export function recordMoment(moment: LifeMoment): void {
  const next = new Map(byMember);
  const list = withMoment(next.get(moment.member) ?? [], moment);
  next.delete(moment.member); // re-inserted last, so the map's order is "least recently moved first"
  next.set(moment.member, list);
  while (next.size > MEMBERS_KEPT) {
    const oldest = next.keys().next().value;
    if (oldest === undefined) break;
    next.delete(oldest);
  }
  byMember = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const NONE: readonly LifeMoment[] = [];

/** The moments of one member, newest first. */
export const useMoments = (member: string): readonly LifeMoment[] =>
  useSyncExternalStore(subscribe, () => byMember.get(member) ?? NONE);
