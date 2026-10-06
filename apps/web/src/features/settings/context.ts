import { createContext, useContext } from 'react';
import type { EntryId } from './entries.js';

/** A short notice that can take the change back (an optimistic update the person may regret). */
export type Notice = { text: string; undo?: () => void };

type SettingsView = {
  /** What the search box holds; the matches are its result (null: no search, everything shows). */
  query: string;
  matches: ReadonlySet<EntryId> | null;
  notify: (notice: Notice) => void;
};

export const SettingsContext = createContext<SettingsView>({
  query: '',
  matches: null,
  notify: () => undefined,
});

export const useSettings = () => useContext(SettingsContext);
