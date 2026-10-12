import { useCallback, useState } from 'react';
import type { SquadView } from '../feed/feed-squads.js';

type SquadOpen = Readonly<Record<string, boolean>>;
const STORAGE_KEY = 'aether.squadOpen';
const MAX_KEPT = 100;

export function withSquadOpen(state: SquadOpen, key: string, open: boolean): SquadOpen {
  if (state[key] === open) return state;
  const next: Record<string, boolean> = { ...state };
  delete next[key];
  next[key] = open;
  return Object.fromEntries(Object.entries(next).slice(-MAX_KEPT));
}

export function parseSquadOpen(raw: string | null): SquadOpen {
  try {
    const parsed: unknown = JSON.parse(raw ?? '{}');
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter(([, v]) => typeof v === 'boolean'));
  } catch {
    return {};
  }
}

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
