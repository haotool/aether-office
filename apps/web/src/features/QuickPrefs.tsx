import { Globe2, Moon, Sprout, Sun } from 'lucide-react';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';

/** Language, theme and 3D quality, at the foot of the drawer: the top bar has no room for them on a phone. */
export function QuickPrefs() {
  const t = useT();
  const prefs = usePreferences();
  return (
    <div className="quick-prefs">
      <button
        className="secondary"
        aria-label={t('language')}
        onClick={() => prefs.set({ locale: prefs.locale === 'zh-TW' ? 'en' : 'zh-TW' })}
      >
        <Globe2 size={18} />
        {prefs.locale === 'zh-TW' ? 'English' : '繁體中文'}
      </button>
      <button
        className="secondary"
        aria-label={t('appearance')}
        onClick={() => prefs.set({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
      >
        {prefs.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        {prefs.theme === 'dark' ? t('light') : t('dark')}
      </button>
      <button
        className="secondary"
        aria-pressed={prefs.beanstalk}
        onClick={() => prefs.set({ beanstalk: !prefs.beanstalk })}
      >
        <Sprout size={18} />
        {t('beanstalk')}
      </button>
      <label>
        <span>{t('quality')}</span>
        <select
          value={prefs.quality}
          onChange={(e) => prefs.set({ quality: e.target.value as typeof prefs.quality })}
        >
          {(['low', 'balanced', 'high'] as const).map((q) => (
            <option key={q} value={q}>
              {t(q)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
