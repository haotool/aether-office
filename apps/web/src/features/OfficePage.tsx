import { useEffect } from 'react';
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
import type { Layout, Snapshot } from '@aether/contracts';
import type { Session } from '../api.js';
import { usePreferences } from '../state.js';
import type { TourAction, TourState } from '../tour.js';
import { useT, AvatarIcon } from '../ui.js';
import type { OfficeModel } from './office-model.js';
import { SceneView } from './SceneView.js';

/** The office page: heading and counts, the 3D scene (or the 2D list) with its toolbar, and the team strip. */
export function OfficePage({
  data,
  session,
  model,
  projectId,
  selectedId,
  focus,
  tour,
  preview,
  unread,
  canWrite,
  onSelect,
  onFocus,
  onTour,
  onToggleInspector,
  onNewTask,
  onEditLayout,
  onNotice,
  onRefresh,
  focusSelected,
  onFocusHandled,
}: {
  data: Snapshot;
  session: Session;
  model: OfficeModel;
  projectId: string;
  selectedId: string | null;
  focus: string;
  tour: TourState;
  /** A layout being edited, shown live in the scene before it is saved. */
  preview: Layout | null;
  /** Keys of local sessions with something new for the user. */
  unread: ReadonlySet<string>;
  canWrite: boolean;
  onSelect: (id: string) => void;
  onFocus: (focus: string) => void;
  onTour: (action: TourAction) => void;
  onToggleInspector: () => void;
  onNewTask: () => void;
  onEditLayout: () => void;
  onNotice: (message: string) => void;
  onRefresh: () => void;
  /** A link asked for the selected member to be brought into view ("show in office"). */
  focusSelected: boolean;
  onFocusHandled: () => void;
}) {
  const t = useT();
  const prefs = usePreferences();
  // The camera flies to the member once it has a desk: the request waits for the member to appear in the scene.
  const present = selectedId !== null && model.agents.some((a) => a.id === selectedId);
  useEffect(() => {
    if (!focusSelected || !present) return;
    onFocus(selectedId);
    onFocusHandled();
  }, [focusSelected, present, selectedId, onFocus, onFocusHandled]);
  return (
    <>
      <>
        <div className="office-heading">
          <div>
            <div className="eyebrow">
              AETHER ORBITAL CAMPUS <span>/ 01</span>
            </div>
            <h1>{t('title')}</h1>
            <p>{t('subtitle')}</p>
          </div>
          <div className="office-heading-actions">
            <button className="secondary" onClick={onToggleInspector} aria-label={t('details')}>
              <PanelRightClose size={17} />
            </button>
            <button className="primary" disabled={!canWrite} onClick={onNewTask}>
              <Plus size={16} />
              {t('newWork')}
            </button>
          </div>
        </div>
        <div className="office-stats">
          <span>
            <i className="dot mint" />
            {model.agents.length} {t('agents')}
          </span>
          <span>
            <i className="dot gold" />
            {data.work.filter((w) => w.state === 'running').length} {t('working')}
          </span>
          <span>
            <i className="dot lilac" />
            {data.work.filter((w) => w.state === 'reviewing').length} {t('reviewing')}
          </span>
          <span className="stats-note">{session.mode === 'demo' ? t('demoNote') : t('live')}</span>
        </div>
        <div className="scene-shell">
          <div className="scene-toolbar">
            <div className="segmented">
              <button
                className={prefs.view === '3d' ? 'selected' : ''}
                onClick={() => prefs.set({ view: '3d' })}
              >
                {t('view3d')}
              </button>
              <button
                className={prefs.view === '2d' ? 'selected' : ''}
                onClick={() => prefs.set({ view: '2d' })}
              >
                {t('view2d')}
              </button>
            </div>
            <div className="scene-options">
              <select
                aria-label={t('quality')}
                value={prefs.quality}
                onChange={(e) => prefs.set({ quality: e.target.value as typeof prefs.quality })}
              >
                {(['low', 'balanced', 'high'] as const).map((q) => (
                  <option key={q} value={q}>
                    {t(q)}
                  </option>
                ))}
              </select>
              <button
                aria-label={t('beanstalk')}
                title={t('beanstalk')}
                aria-pressed={prefs.beanstalk}
                onClick={() => prefs.set({ beanstalk: !prefs.beanstalk })}
              >
                <Sprout size={16} />
              </button>
              {tour.status === 'idle' ? (
                <button
                  aria-label={t('tourStart')}
                  title={t('tourStart')}
                  onClick={() => onTour({ type: 'start', restore: focus })}
                >
                  <Play size={16} />
                </button>
              ) : (
                <>
                  <button
                    aria-label={tour.status === 'playing' ? t('tourPause') : t('tourResume')}
                    title={tour.status === 'playing' ? t('tourPause') : t('tourResume')}
                    onClick={() => onTour({ type: tour.status === 'playing' ? 'pause' : 'resume' })}
                  >
                    {tour.status === 'playing' ? <Pause size={16} /> : <Play size={16} />}
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
              )}
              <button
                aria-label={t('reset')}
                title={t('reset')}
                onClick={() => onFocus(focus === 'overview' ? 'atrium' : 'overview')}
              >
                <RotateCcw size={16} />
              </button>
              <button
                aria-label={t('editLayout')}
                title={t('editLayout')}
                disabled={!canWrite}
                onClick={onEditLayout}
              >
                <PencilRuler size={16} />
              </button>
            </div>
          </div>
          <SceneView
            data={data}
            model={model}
            selectedId={selectedId}
            focus={focus}
            preview={preview}
            unread={unread}
            canWrite={canWrite}
            onSelect={onSelect}
            onTour={onTour}
            onNotice={onNotice}
            onRefresh={onRefresh}
          />
          <div className="scene-footer">
            <span>
              <Orbit size={13} /> AETHER / ORBITAL CAMPUS
            </span>
            <span>
              {prefs.view === '3d' ? 'WEBGL2' : '2D'} · {t(session.mode)}
            </span>
          </div>
        </div>
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
                <AvatarIcon name={agent.name} species={agent.species} color={agent.color} />
                <div>
                  <strong>{agent.name}</strong>
                  <small>{agent.role}</small>
                </div>
                <i className={`dot ${agent.activity === 'working' ? 'mint' : 'quiet'}`} />
              </button>
            ))}
          </div>
        </section>
      </>
    </>
  );
}
