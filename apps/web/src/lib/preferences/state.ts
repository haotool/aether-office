import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LIFE_PREFS, type LifePrefs } from '@aether/office-scene/model';
import { hasLocale, loadLocale, resolveLocale, type Locale } from '../i18n/i18n.js';
import { migratePreferences, normalizeLife, PREFS_VERSION } from './prefs-migrate.js';
import { resolveTheme, useSystemDark, type Theme, type ThemePreference } from './theme.js';
/** The scene's frame-rate limit per setting; `auto` draws as often as the screen asks. */
export const FPS_CAPS = { auto: undefined, '60': 60, '30': 30 } as const;
type FpsSetting = keyof typeof FPS_CAPS;
export type Preferences = {
  locale: Locale;
  theme: ThemePreference;
  quality: 'low' | 'balanced' | 'high';
  fps: FpsSetting;
  reducedMotion: boolean;
  notify: boolean;
  advanced: boolean;
  view: '2d' | '3d';
  autoCamera: boolean;
  life: LifePrefs;
  strings: boolean;
  beanstalk: boolean;
  panelWidth: number | null;
  panelCollapsed: boolean;
  set: (next: Partial<Omit<Preferences, 'set'>>) => void;
};
export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      locale: resolveLocale(navigator.language),
      theme: 'dark',
      quality: 'balanced',
      fps: 'auto',
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      notify: true,
      advanced: false,
      // On for a person. Off under browser automation: a camera that is always gliding is never "stable" to a test
      // that waits for a target to hold still before it taps it.
      autoCamera: !navigator.webdriver,
      life: {
        ...DEFAULT_LIFE_PREFS,
        calm: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      },
      strings: true,
      beanstalk: !window.matchMedia('(max-width: 760px)').matches,
      panelWidth: null,
      panelCollapsed: false,
      view: '3d', // a phone gets the 3D office too; the 2D list is one tap away and the fallback when WebGL fails
      set: (next) => {
        if (next.locale && !hasLocale(next.locale))
          void loadLocale(next.locale).then(() => set(next));
        else set(next);
      },
    }),
    {
      name: 'aether-ui-preferences',
      version: PREFS_VERSION,
      migrate: (stored, version) => migratePreferences(stored, version) as Preferences,
      // A stored `life` is checked on every load, so a hand-edited or half-written one cannot break the scene.
      merge: (stored, current) => {
        const saved = (stored ?? {}) as Partial<Preferences>;
        return { ...current, ...saved, life: normalizeLife(saved.life, current.life.calm) };
      },
      partialize: (state) => ({
        locale: state.locale,
        theme: state.theme,
        quality: state.quality,
        fps: state.fps,
        reducedMotion: state.reducedMotion,
        notify: state.notify,
        advanced: state.advanced,
        view: state.view,
        autoCamera: state.autoCamera,
        life: state.life,
        strings: state.strings,
        beanstalk: state.beanstalk,
        panelWidth: state.panelWidth,
        panelCollapsed: state.panelCollapsed,
      }),
    },
  ),
);

try {
  const saved = JSON.parse(localStorage.getItem('aether-ui-preferences') ?? '{}') as {
    state?: { locale?: string };
  };
  if (!saved.state?.locale) usePreferences.setState({});
} catch {
  /* no storage (a private window): the detected language is used for this visit */
}

export function useTheme(): Theme {
  const preference = usePreferences((s) => s.theme);
  return resolveTheme(preference, useSystemDark());
}
