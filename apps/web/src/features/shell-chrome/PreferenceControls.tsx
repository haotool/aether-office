import { usePreferences, useTheme } from '../../lib/preferences/state.js';
import { useT } from '../../ui/useT.js';

const OTHER_LOCALE = { 'zh-TW': 'en', en: 'zh-TW' } as const;
/** A language's own name: the button offers the language it would switch to. */
const LANGUAGE_NAME = { 'zh-TW': '繁體中文', en: 'English' } as const;

/** The language switch: the name of the other language and the action that switches to it. */
export function useLocaleToggle() {
  const prefs = usePreferences();
  const next = OTHER_LOCALE[prefs.locale];
  return { nextName: LANGUAGE_NAME[next], toggle: () => prefs.set({ locale: next }) };
}

/** The light/dark switch: the theme in force and the action that flips it. */
export function useThemeToggle() {
  const prefs = usePreferences();
  const theme = useTheme();
  return { theme, toggle: () => prefs.set({ theme: theme === 'dark' ? 'light' : 'dark' }) };
}

/** The 3D quality choice (low, balanced, high). */
export function QualitySelect({ label }: { label?: string }) {
  const t = useT();
  const prefs = usePreferences();
  return (
    <select
      aria-label={label}
      value={prefs.quality}
      onChange={(e) => prefs.set({ quality: e.target.value as typeof prefs.quality })}
    >
      {(['low', 'balanced', 'high'] as const).map((q) => (
        <option key={q} value={q}>
          {t(q)}
        </option>
      ))}
    </select>
  );
}
