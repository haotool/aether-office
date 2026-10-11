import { create } from 'zustand';
import type { Pending } from './composer-model.js';

type Outbox = {
  bySession: Record<string, Pending[]>;
  update: (key: string, change: (list: readonly Pending[]) => Pending[]) => void;
};

export const useOutbox = create<Outbox>((set) => ({
  bySession: {},
  update: (key, change) =>
    set((s) => ({ bySession: { ...s.bySession, [key]: change(s.bySession[key] ?? []) } })),
}));

const NONE: readonly Pending[] = [];
export const usePending = (key: string) => useOutbox((s) => s.bySession[key] ?? NONE);
