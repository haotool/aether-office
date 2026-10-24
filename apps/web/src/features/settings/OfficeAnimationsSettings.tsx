import { usePreferences } from '../../lib/preferences/state.js';
import type { LifePrefs } from '../../lib/preferences/prefs-migrate.js';
import { useT } from '../../ui/useT.js';
import { Row, StatusChip, Switch } from './kit.js';

export function OfficeAnimationsSettings() {
  const t = useT();
  const prefs = usePreferences();
  const life = prefs.life;
  const setLife = (next: Partial<LifePrefs>) => prefs.set({ life: { ...life, ...next } });
  return (
    <>
      <Row
        id="lifeCalm"
        control={<Switch checked={life.calm} onChange={(calm) => setLife({ calm })} />}
        status={life.calm && <StatusChip tone="info">{t('lifeCalmOn')}</StatusChip>}
      />
      <Row
        id="lifeRelation"
        control={<Switch checked={life.relation} onChange={(relation) => setLife({ relation })} />}
      />
    </>
  );
}
