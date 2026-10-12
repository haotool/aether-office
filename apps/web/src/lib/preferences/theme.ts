import { useSyncExternalStore } from 'react';

export type ThemePreference = 'system' | 'dark' | 'light';
export type Theme = 'dark' | 'light';

export const resolveTheme = (preference: string, systemDark: boolean): Theme =>
  preference === 'light' ? 'light' : preference === 'system' && !systemDark ? 'light' : 'dark';

const QUERY = '(prefers-color-scheme: dark)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

export const useSystemDark = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
