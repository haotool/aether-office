import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from './i18n.js';
type Preferences = {
  locale: Locale;
  theme: 'dark' | 'light';
  quality: 'low' | 'balanced' | 'high';
  reducedMotion: boolean;
  /** Browser notification for new approval requests. Off until the user turns it on. */
  notifyApprovals: boolean;
  view: '2d' | '3d';
  set: (next: Partial<Omit<Preferences, 'set'>>) => void;
};
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      locale: 'zh-TW',
      theme: 'dark',
      quality: 'balanced',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      notifyApprovals: false,
      view: window.innerWidth < 760 ? '2d' : '3d',
      set: (next) => set(next),
    }),
    {
      name: 'aether-ui-preferences',
      partialize: (state) => ({
        locale: state.locale,
        theme: state.theme,
        quality: state.quality,
        reducedMotion: state.reducedMotion,
        notifyApprovals: state.notifyApprovals,
        view: state.view,
      }),
    },
  ),
);
