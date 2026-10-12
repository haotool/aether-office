import { useSyncExternalStore } from 'react';
import type { LifeMoment } from '@aether/office-scene/model';

// Decorative and in memory only: never persisted, gone with the page.

export const MOMENTS_PER_MEMBER = 5;
const MEMBERS_KEPT = 40;

let byMember: ReadonlyMap<string, readonly LifeMoment[]> = new Map();
const listeners = new Set<() => void>();

export const withMoment = (list: readonly LifeMoment[], moment: LifeMoment): LifeMoment[] =>
  [moment, ...list].slice(0, MOMENTS_PER_MEMBER);

export function recordMoment(moment: LifeMoment): void {
  const next = new Map(byMember);
  const list = withMoment(next.get(moment.member) ?? [], moment);
  next.delete(moment.member);
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

export const useMoments = (member: string): readonly LifeMoment[] =>
  useSyncExternalStore(subscribe, () => byMember.get(member) ?? NONE);
