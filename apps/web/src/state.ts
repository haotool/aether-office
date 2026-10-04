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
  /** The camera runs itself (the director). On until the person turns it off. */
  autoCamera: boolean;
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
      // On for a person. Off under browser automation: a camera that is always gliding is never "stable" to a test
      // that waits for a target to hold still before it taps it.
      autoCamera: !navigator.webdriver,
      view: '3d', // a phone gets the 3D office too; the 2D list is one tap away and the fallback when WebGL fails
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
        autoCamera: state.autoCamera,
      }),
    },
  ),
);
