import { Globe2, Moon, Sprout, Sun, Wind } from 'lucide-react';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
import { PairPhoneButton } from './ConnectPhone.js';
import { QualitySelect, useLocaleToggle, useThemeToggle } from './PreferenceControls.js';

/** Language, theme and 3D quality, at the foot of the drawer: the top bar has no room for them on a phone. */
export function QuickPrefs({ canPair }: { canPair: boolean }) {
  const t = useT();
  const prefs = usePreferences();
  const locale = useLocaleToggle();
  const theme = useThemeToggle();
  return (
    <div className="quick-prefs">
      <button className="secondary" aria-label={t('language')} onClick={locale.toggle}>
        <Globe2 size={18} />
        {locale.nextName}
      </button>
      <button className="secondary" aria-label={t('appearance')} onClick={theme.toggle}>
        {theme.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        {theme.theme === 'dark' ? t('light') : t('dark')}
      </button>
      <button
        className="secondary"
        aria-pressed={prefs.beanstalk}
        onClick={() => prefs.set({ beanstalk: !prefs.beanstalk })}
      >
        <Sprout size={18} />
        {t('beanstalk')}
      </button>
      <button
        className="secondary"
        aria-pressed={prefs.life.calm}
        onClick={() => prefs.set({ life: { ...prefs.life, calm: !prefs.life.calm } })}
      >
        <Wind size={18} />
        {t('stLifeCalmLabel')}
      </button>
      {canPair && <PairPhoneButton variant="text" />}
      <label>
        <span>{t('quality')}</span>
        <QualitySelect />
      </label>
    </div>
  );
}
