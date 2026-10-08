import { useCallback, useState } from 'react';
import type { SquadView } from '../feed/feed-squads.js';

/**
 * Which squads the person opened or folded, by supervisor session key, kept in this browser only. A squad with no
 * choice of its own follows its default (folded past three subagents, open while one waits for approval).
 */
type SquadOpen = Readonly<Record<string, boolean>>;
const STORAGE_KEY = 'aether.squadOpen';
const MAX_KEPT = 100;

/** Pure. A new map with the squad's choice recorded; the oldest choices are dropped past a bound. */
export function withSquadOpen(state: SquadOpen, key: string, open: boolean): SquadOpen {
  if (state[key] === open) return state;
  const next: Record<string, boolean> = { ...state };
  delete next[key]; // re-inserted last, so the oldest choice is the first to go
  next[key] = open;
  return Object.fromEntries(Object.entries(next).slice(-MAX_KEPT));
}

/** Pure. Anything stored that is not a map of booleans is ignored. */
export function parseSquadOpen(raw: string | null): SquadOpen {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'boolean'));
  } catch {
    return {};
  }
}

/** Pure. Is the squad open: the person's choice, else the squad's own default. */
export const isSquadOpen = (state: SquadOpen, key: string, squad: Pick<SquadView, 'defaultOpen'>) =>
  state[key] ?? squad.defaultOpen;

const load = (): SquadOpen => {
  try {
    return parseSquadOpen(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
};

export function useSquadOpen() {
  const [state, setState] = useState<SquadOpen>(load);
  const setOpen = useCallback((key: string, open: boolean) => {
    setState((was) => {
      const next = withSquadOpen(was, key, open);
      if (next !== was)
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          /* storage refused: the choice only lasts for this page */
        }
      return next;
    });
  }, []);
  return { state, setOpen };
}
