import { useSyncExternalStore } from 'react';

/** What the person chose; `system` follows the operating system's colour scheme. */
export type ThemePreference = 'system' | 'dark' | 'light';
export type Theme = 'dark' | 'light';

/** The theme that is drawn. A stored value this build does not know (an older or newer one) reads as dark. */
export const resolveTheme = (preference: string, systemDark: boolean): Theme =>
  preference === 'light' ? 'light' : preference === 'system' && !systemDark ? 'light' : 'dark';

const QUERY = '(prefers-color-scheme: dark)';
const subscribe = (notify: () => void) => {
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};

/** True while the operating system asks for a dark scheme. */
export const useSystemDark = () =>
  useSyncExternalStore(subscribe, () => window.matchMedia(QUERY).matches);
