import { usePreferences, type Preferences } from '../../lib/preferences/state.js';
import { resolveTheme, useSystemDark, type ThemePreference } from '../../lib/preferences/theme.js';
import { useT } from '../../ui/useT.js';
import { Row, Segmented, SelectBox, StatusChip, Switch } from './kit.js';

type Prefs = Preferences;

function ThemeRow({ prefs }: { prefs: Prefs }) {
  const t = useT();
  const systemDark = useSystemDark();
  const themes: { value: ThemePreference; label: string }[] = [
    { value: 'system', label: t('stSystem') },
    { value: 'dark', label: t('dark') },
    { value: 'light', label: t('light') },
  ];
  return (
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
            {t('stSystemNow')} {t(resolveTheme('system', systemDark) === 'dark' ? 'dark' : 'light')}
          </StatusChip>
        )
      }
    />
  );
}

function MotionRow({ prefs }: { prefs: Prefs }) {
  const t = useT();
  const osReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return (
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
  );
}

export function GeneralSection() {
  const t = useT();
  const prefs = usePreferences();
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
      <ThemeRow prefs={prefs} />
      <MotionRow prefs={prefs} />
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
