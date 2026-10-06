import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from './i18n.js';
import { resolveTheme, useSystemDark, type Theme, type ThemePreference } from './theme.js';
type Preferences = {
  locale: Locale;
  /** `system` follows the operating system's scheme; the two older stored values keep meaning what they did. */
  theme: ThemePreference;
  quality: 'low' | 'balanced' | 'high';
  reducedMotion: boolean;
  /** Alerts when a session needs the person, asks for an approval, or ends a long turn. On until turned off. */
  notify: boolean;
  /** The pages for orchestrating several agents (tasks, review, team, ...). Hidden from the navigation until turned on. */
  advanced: boolean;
  view: '2d' | '3d';
  /** The camera runs itself (the director). On until the person turns it off. */
  autoCamera: boolean;
  /** The first-visit camera tour: `auto` plays it once per browser session, `never` is "don't show again" (Replay still works). */
  intro: 'auto' | 'never';
  /** The Git beanstalk rising past the 3D building. On for a desktop, off on a phone, where it would crowd the scene. */
  beanstalk: boolean;
  /** The session panel's width in px; null is the default for the window (features/panel-width.ts). */
  panelWidth: number | null;
  /** The panel is a slim rail with badges and a re-open button. */
  panelCollapsed: boolean;
  set: (next: Partial<Omit<Preferences, 'set'>>) => void;
};
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      locale: 'zh-TW',
      theme: 'dark',
      quality: 'balanced',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      notify: true,
      advanced: false,
      // On for a person. Off under browser automation: a camera that is always gliding is never "stable" to a test
      // that waits for a target to hold still before it taps it.
      autoCamera: !navigator.webdriver,
      intro: 'auto',
      beanstalk: !window.matchMedia('(max-width: 760px)').matches,
      panelWidth: null,
      panelCollapsed: false,
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
        notify: state.notify,
        advanced: state.advanced,
        view: state.view,
        autoCamera: state.autoCamera,
        intro: state.intro,
        beanstalk: state.beanstalk,
        panelWidth: state.panelWidth,
        panelCollapsed: state.panelCollapsed,
      }),
    },
  ),
);

/** The theme being drawn: the person's choice, or the system's when they chose to follow it. */
export function useTheme(): Theme {
  const preference = usePreferences((s) => s.theme);
  return resolveTheme(preference, useSystemDark());
}
