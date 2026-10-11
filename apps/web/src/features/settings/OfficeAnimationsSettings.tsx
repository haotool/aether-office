import { LIFE_CATEGORIES, type LifePrefs, type MemeCategory } from '@aether/office-scene/model';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Key } from '../../lib/i18n/i18n.js';
import { requestIntroReplay } from '../../lib/navigation/intro-gate.js';
import { usePreferences } from '../../lib/preferences/state.js';
import { useT } from '../../ui/useT.js';
import { Block, Row, Segmented, StatusChip, Switch } from './kit.js';

const KIND_LABEL: Record<MemeCategory, Key> = {
  work: 'lifeKindWork',
  git: 'lifeKindGit',
  test: 'lifeKindTest',
  ops: 'lifeKindOps',
  wellbeing: 'lifeKindWellbeing',
  social: 'lifeKindSocial',
  meme: 'lifeKindMeme',
  easter: 'lifeKindEaster',
};

function LifeKinds({
  life,
  setLife,
}: {
  life: LifePrefs;
  setLife: (next: Partial<LifePrefs>) => void;
}) {
  const t = useT();
  return (
    <Block id="lifeKinds">
      <div className="srow-text">
        <h3>{t('stLifeKindsLabel')}</h3>
        <p>{t('stLifeKindsDesc')}</p>
      </div>
      <ul className="skinds">
        {LIFE_CATEGORIES.map((id) => (
          <li key={id}>
            <span>{t(KIND_LABEL[id])}</span>
            <Switch
              name={t(KIND_LABEL[id])}
              checked={life.categories[id]}
              disabled={life.calm}
              onChange={(on) => setLife({ categories: { ...life.categories, [id]: on } })}
            />
          </li>
        ))}
      </ul>
    </Block>
  );
}

function IntroRows() {
  const t = useT();
  const prefs = usePreferences();
  const navigate = useNavigate();
  const project = new URLSearchParams(useLocation().search).get('project');
  const replay = () => {
    requestIntroReplay();
    navigate(`/office${project ? `?project=${encodeURIComponent(project)}` : ''}`);
  };
  return (
    <>
      <Row
        id="intro"
        control={
          <Segmented
            value={prefs.intro}
            options={[
              { value: 'auto', label: t('introAuto') },
              { value: 'never', label: t('introNever') },
            ]}
            onChange={(intro) => prefs.set({ intro })}
          />
        }
      />
      <Row
        id="introReplay"
        control={
          <button type="button" className="secondary" onClick={replay}>
            {t('introReplayButton')}
          </button>
        }
      />
    </>
  );
}

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
      <Row
        id="puppetStrings"
        control={
          <Switch
            checked={prefs.strings}
            disabled={!life.relation}
            onChange={(strings) => prefs.set({ strings })}
          />
        }
      />
      <LifeKinds life={life} setLife={setLife} />
      <Row
        id="lifeFrequency"
        control={
          <Segmented
            value={life.frequency}
            disabled={life.calm}
            options={[
              { value: 'rare', label: t('lifeRare') },
              { value: 'normal', label: t('lifeNormal') },
            ]}
            onChange={(frequency) => setLife({ frequency })}
          />
        }
      />
      <IntroRows />
    </>
  );
}
