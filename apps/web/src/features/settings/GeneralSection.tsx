import { usePreferences } from '../../state.js';
import { resolveTheme, useSystemDark, type ThemePreference } from '../../theme.js';
import { useT } from '../../ui.js';
import { Row, Segmented, SelectBox, StatusChip, Switch } from './kit.js';

/** Language, appearance, motion and the quality of the 3D scene: personal, kept in this browser, applied at once. */
export function GeneralSection() {
  const t = useT();
  const prefs = usePreferences();
  const systemDark = useSystemDark();
  const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('stSystem') },
    { value: 'dark', label: t('dark') },
    { value: 'light', label: t('light') },
  ];
  return (
    <>
      <Row
        id="language"
        control={
          <SelectBox
            value={prefs.locale}
            options={[
              { value: 'zh-TW', label: '繁體中文' },
              { value: 'en', label: 'English' },
            ]}
            onChange={(locale) => prefs.set({ locale })}
          />
        }
      />
      <Row
        id="theme"
        control={
          <Segmented
            value={prefs.theme}
            options={themes}
            onChange={(theme) => prefs.set({ theme })}
          />
        }
        status={
          prefs.theme === 'system' && (
            <StatusChip tone="info">
              {t('stSystemNow')}{' '}
              {t(resolveTheme('system', systemDark) === 'dark' ? 'dark' : 'light')}
            </StatusChip>
          )
        }
      />
      <Row
        id="motion"
        control={
          <Switch
            checked={prefs.reducedMotion}
            onChange={(reducedMotion) => prefs.set({ reducedMotion })}
          />
        }
        status={osReduced && <StatusChip tone="info">{t('stOsReduced')}</StatusChip>}
      />
      <Row
        id="quality"
        control={
          <Segmented
            value={prefs.quality}
            options={(['low', 'balanced', 'high'] as const).map((value) => ({
              value,
              label: t(value),
            }))}
            onChange={(quality) => prefs.set({ quality })}
          />
        }
      />
    </>
  );
}
