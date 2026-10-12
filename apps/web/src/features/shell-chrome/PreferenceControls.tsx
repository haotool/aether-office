import { usePreferences, useTheme } from '../../lib/preferences/state.js';
import { useT } from '../../ui/useT.js';

const OTHER_LOCALE = { 'zh-TW': 'en', en: 'zh-TW' } as const;
const LANGUAGE_NAME = { 'zh-TW': '繁體中文', en: 'English' } as const;

export function useLocaleToggle() {
  const prefs = usePreferences();
  const next = OTHER_LOCALE[prefs.locale];
  return { nextName: LANGUAGE_NAME[next], toggle: () => prefs.set({ locale: next }) };
}

export function useThemeToggle() {
  const prefs = usePreferences();
  const theme = useTheme();
  return { theme, toggle: () => prefs.set({ theme: theme === 'dark' ? 'light' : 'dark' }) };
}

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
