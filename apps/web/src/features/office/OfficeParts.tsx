import { NavLink } from 'react-router-dom';
import {
  ArrowUpRight,
  Orbit,
  Pause,
  PanelRightClose,
  PencilRuler,
  Play,
  Plus,
  RotateCcw,
  SkipForward,
  Sprout,
  Square,
} from 'lucide-react';
import type { Snapshot } from '@aether/contracts';
import type { Session } from '../../lib/api/api-session.js';
import { usePreferences } from '../../lib/preferences/state.js';
import type { TourAction, TourState } from '../../lib/navigation/tour.js';
import { useT, useWhy } from '../../ui/useT.js';
import { avatarState } from '../../avatar/state.js';
import { Avatar } from './Avatar.js';
import { squadAccentOf } from '../feed/feed-squads.js';
import type { OfficeModel } from './office-model.js';
import { QualitySelect } from '../shell-chrome/PreferenceControls.js';

type SceneToolbarProps = {
  tour: TourState;
  focus: string;
  canWrite: boolean;
  onTour: (action: TourAction) => void;
  onFocus: (focus: string) => void;
  onEditLayout: () => void;
};

/** The page title and the actions beside it: fold the side panel, add work. */
export function OfficeHeading({
  canWrite,
  onTogglePanel,
  onNewTask,
}: {
  canWrite: boolean;
  onTogglePanel: () => void;
  onNewTask: () => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  const prefs = usePreferences();
  return (
    <div className="office-heading">
      <div>
        <div className="eyebrow">
          AETHER ORBITAL CAMPUS <span>/ 01</span>
        </div>
        <h1>{t('title')}</h1>
        <p>{t('subtitle')}</p>
      </div>
      <div className="office-heading-actions">
        <button className="secondary" onClick={onTogglePanel} aria-label={t('panelTitle')}>
          <PanelRightClose size={17} />
        </button>
        {prefs.advanced && (
          <button
            className="primary"
            disabled={!canWrite}
            onClick={onNewTask}
            {...whyNot([canWrite, 'needOperator'])}
          >
            <Plus size={16} />
            {t('newWork')}
          </button>
        )}
      </div>
    </div>
  );
}

/** How many are on the floor, working and in review, and whether this is the demo. */
export function OfficeStats({
  data,
  model,
  mode,
}: {
  data: Snapshot;
  model: OfficeModel;
  mode: Session['mode'];
}) {
  const t = useT();
  const count = (state: string) => data.work.filter((w) => w.state === state).length;
  return (
    <div className="office-stats">
      <span>
        <i className="dot mint" />
        {model.agents.length} {t('agents')}
      </span>
      <span>
        <i className="dot gold" />
        {count('running')} {t('working')}
      </span>
      <span>
        <i className="dot lilac" />
        {count('reviewing')} {t('reviewing')}
      </span>
      <span className="stats-note">{mode === 'demo' ? t('demoNote') : t('live')}</span>
    </div>
  );
}

/** The tour's buttons: start while idle, otherwise pause or resume, skip and stop. */
function TourControls({
  tour,
  focus,
  onTour,
}: {
  tour: TourState;
  focus: string;
  onTour: (action: TourAction) => void;
}) {
  const t = useT();
  if (tour.status === 'idle')
    return (
      <button
        aria-label={t('tourStart')}
        title={t('tourStart')}
        onClick={() => onTour({ type: 'start', restore: focus })}
      >
        <Play size={16} />
      </button>
    );
  const playing = tour.status === 'playing';
  const toggleLabel = playing ? t('tourPause') : t('tourResume');
  return (
    <>
      <button
        aria-label={toggleLabel}
        title={toggleLabel}
        onClick={() => onTour({ type: playing ? 'pause' : 'resume' })}
      >
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <button
        aria-label={t('tourSkip')}
        title={t('tourSkip')}
        onClick={() => onTour({ type: 'skip' })}
      >
        <SkipForward size={16} />
      </button>
      <button
        aria-label={t('tourStop')}
        title={t('tourStop')}
        onClick={() => onTour({ type: 'stop' })}
      >
        <Square size={16} />
      </button>
    </>
  );
}

/** 3D or 2D. */
function ViewSwitch() {
  const t = useT();
  const prefs = usePreferences();
  return (
    <div className="segmented">
      {(['3d', '2d'] as const).map((view) => (
        <button
          key={view}
          className={prefs.view === view ? 'selected' : ''}
          onClick={() => prefs.set({ view })}
        >
          {t(view === '3d' ? 'view3d' : 'view2d')}
        </button>
      ))}
    </div>
  );
}

/** The scene's toolbar: 3D/2D, quality, beanstalk, the tour, the camera reset and the layout editor. */
export function SceneToolbar({
  tour,
  focus,
  canWrite,
  onTour,
  onFocus,
  onEditLayout,
}: SceneToolbarProps) {
  const t = useT();
  const whyNot = useWhy();
  const prefs = usePreferences();
  return (
    <div className="scene-toolbar">
      <ViewSwitch />
      <div className="scene-options">
        <QualitySelect label={t('quality')} />
        <button
          aria-label={t('beanstalk')}
          title={t('beanstalk')}
          aria-pressed={prefs.beanstalk}
          onClick={() => prefs.set({ beanstalk: !prefs.beanstalk })}
        >
          <Sprout size={16} />
        </button>
        <TourControls tour={tour} focus={focus} onTour={onTour} />
        <button
          aria-label={t('reset')}
          title={t('reset')}
          onClick={() => onFocus(focus === 'overview' ? 'atrium' : 'overview')}
        >
          <RotateCcw size={16} />
        </button>
        {prefs.advanced && (
          <button
            aria-label={t('editLayoutExperimental')}
            title={t('editLayoutExperimental')}
            disabled={!canWrite}
            {...whyNot([canWrite, 'needOperator'])}
            onClick={onEditLayout}
          >
            <PencilRuler size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/** The caption under the scene: which renderer and which mode. */
export function SceneFooter({ mode }: { mode: Session['mode'] }) {
  const t = useT();
  const view = usePreferences((s) => s.view);
  return (
    <div className="scene-footer">
      <span>
        <Orbit size={13} /> AETHER / ORBITAL CAMPUS
      </span>
      <span>
        {view === '3d' ? 'WEBGL2' : '2D'} · {t(mode)}
      </span>
    </div>
  );
}

/** One chip per member under the scene; a click selects it. */
export function TeamStrip({
  model,
  projectId,
  selectedId,
  onSelect,
}: {
  model: OfficeModel;
  projectId: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useT();
  return (
    <section className="team-strip">
      <div className="section-label">
        <span>{t('team')}</span>
        <NavLink to={`/agents?project=${projectId}`}>
          {t('details')}
          <ArrowUpRight size={13} />
        </NavLink>
      </div>
      <div className="team-strip-list">
        {model.agents.map((agent) => (
          <button
            className={`team-chip ${agent.id === selectedId ? 'selected' : ''}`}
            key={agent.id}
            title={`${agent.name} · ${agent.role}`}
            onClick={() => onSelect(agent.id)}
          >
            <Avatar
              seed={agent.id}
              species={agent.species}
              state={avatarState(agent.activity)}
              {...squadAccentOf(agent.id, model.liveSquads)}
            />
            <div>
              <strong>{agent.name}</strong>
              <small>{agent.role}</small>
            </div>
            <i className={`dot ${agent.activity === 'working' ? 'mint' : 'quiet'}`} />
          </button>
        ))}
      </div>
    </section>
  );
}

/** One session is on the floor: what its bubbles and the figures wait for. */
export function FirstSessionHint() {
  const t = useT();
  return (
    <p className="first-run-hint" role="note">
      <strong>{t('frOneTitle')}.</strong> {t('frOne')}
    </p>
  );
}
