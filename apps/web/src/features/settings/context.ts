import { createContext, useContext } from 'react';
import type { EntryId } from './entries.js';

export type Notice = { text: string; undo?: () => void };

type SettingsView = {
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
