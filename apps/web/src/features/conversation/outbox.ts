import { create } from 'zustand';
import type { Pending } from './composer-model.js';

type Outbox = {
  /** The messages written in a session's composer that its transcript has not yet shown, by session key. */
  bySession: Record<string, Pending[]>;
  update: (key: string, change: (list: readonly Pending[]) => Pending[]) => void;
};

/**
 * Held outside the conversation so the composer (which writes them) and the transcript (which shows them as pending
 * bubbles) see the same list, and a message survives going back to the feed and returning.
 */
export const useOutbox = create<Outbox>((set) => ({
  bySession: {},
  update: (key, change) =>
    set((s) => ({ bySession: { ...s.bySession, [key]: change(s.bySession[key] ?? []) } })),
}));

const NONE: readonly Pending[] = [];
export const usePending = (key: string) => useOutbox((s) => s.bySession[key] ?? NONE);
