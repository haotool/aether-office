import { lazy, Suspense, useEffect, useReducer, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { NavLink, useLocation, useSearchParams } from 'react-router-dom';
import {
  Building2,
  UsersRound,
  ListTodo,
  MessagesSquare,
  ShieldCheck,
  BookOpen,
  Server,
  History as HistoryIcon,
  Settings2,
  Plus,
  ArrowUpRight,
  Orbit,
  Menu,
  X,
  Sun,
  Moon,
  Globe2,
  Radio,
  RotateCcw,
  Play,
  Pause,
  SkipForward,
  Square,
  Focus,
  PencilRuler,
  LogOut,
  Monitor,
  PanelRightClose,
  CheckCheck,
} from 'lucide-react';
import type { Layout, LocalSessionsResponse, Project, Snapshot } from '@aether/contracts';
import { eventSchema } from '@aether/contracts';
import { api, execute, login, type Session } from './api.js';
import { usePreferences } from './state.js';
import { useT, PageHeading, Modal, Field, Empty, Badge, AvatarIcon } from './ui.js';
import type { Key } from './i18n.js';
import { Agents } from './features/Agents.js';
import { CapabilityMatrix } from './features/CapabilityMatrix.js';
import { Tasks, TaskForm } from './features/Tasks.js';
import { Messages } from './features/Messages.js';
import { Inspector } from './features/Inspector.js';
import { Reviews } from './features/Reviews.js';
import { Knowledge } from './features/Knowledge.js';
import { History } from './features/History.js';
import { Workspace } from './features/Workspace.js';
import { EmergencyStop } from './features/EmergencyStop.js';
import { Telemetry } from './features/Telemetry.js';
import { ExecutionSettings } from './features/ExecutionSettings.js';
import { Schedules } from './features/Schedules.js';
import { Rooms } from './features/Rooms.js';
import { Meetings } from './features/Meetings.js';
import { A2AClients } from './features/A2AClients.js';
import { MachineInvite } from './features/MachineInvite.js';
import { Integrations } from './features/Integrations.js';
import { Skills } from './features/Skills.js';
import { Observations } from './features/Observations.js';
import { Approvals } from './features/Approvals.js';
import type { PerfReport } from '@aether/office-scene';
import { useAdoptRepos } from './adoptProjects.js';
import {
  floorResolver,
  mergeLayout,
  roleResolver,
  sessionIdOf,
  sessionsToAgents,
} from './localSessions.js';
import { useApprovalNotifications } from './notifications.js';
import {
  TOUR_INTERVAL_MS,
  idle,
  restoreFocus,
  tourFocus,
  tourReducer,
  type TourAction,
} from './tour.js';
const Terminals = lazy(() =>
  import('./features/Terminals.js').then((m) => ({ default: m.Terminals })),
);
const OfficeScene = lazy(() =>
  import('@aether/office-scene').then((m) => ({ default: m.OfficeScene })),
);
const LayoutEditor = lazy(() =>
  import('./features/LayoutEditor.js').then((m) => ({ default: m.LayoutEditor })),
);
const nav = [
  ['office', Building2],
  ['agents', UsersRound],
  ['tasks', ListTodo],
  ['messages', MessagesSquare],
  ['workspace', Monitor],
  ['terminals', Monitor],
  ['observations', Radio],
  ['reviews', ShieldCheck],
  ['approvals', CheckCheck],
  ['knowledge', BookOpen],
  ['machines', Server],
  ['history', HistoryIcon],
  ['settings', Settings2],
] as const;
function Login({ onLogin }: { onLogin: (session: Session) => void }) {
  const t = useT();
  const prefs = usePreferences();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <main className="login-page">
      <div className="login-art" aria-hidden="true">
        <div className="orbital-ring r1" />
        <div className="orbital-ring r2" />
        <div className="orbital-ring r3" />
        <div className="login-wordmark">
          AETHER<span>OFFICE / ORBITAL CAMPUS</span>
        </div>
      </div>
      <section className="login-panel">
        <img src="/favicon.svg" width="44" height="44" alt="" />
        <span className="eyebrow">YOUR WORK, IN ORBIT</span>
        <h1>{t('loginTitle')}</h1>
        <p>{t('loginHint')}</p>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError('');
            try {
              onLogin(await login(String(new FormData(e.currentTarget).get('token'))));
            } catch (e) {
              setError(e instanceof Error ? e.message : 'LOGIN_FAILED');
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field label={t('token')}>
            <input
              autoFocus
              name="token"
              type="password"
              autoComplete="off"
              required
              minLength={32}
            />
          </Field>
          {error && (
            <p role="alert" className="error-text">
              {error}
            </p>
          )}
          <button className="primary full-width" disabled={busy}>
            {busy ? t('loading') : t('login')}
            <ArrowUpRight size={17} />
          </button>
        </form>
        <small>{t('tokenHelp')}</small>
        <button
          className="text-button"
          onClick={() => prefs.set({ locale: prefs.locale === 'zh-TW' ? 'en' : 'zh-TW' })}
        >
          <Globe2 size={15} />
          {prefs.locale === 'zh-TW' ? 'English' : '繁體中文'}
        </button>
      </section>
    </main>
  );
}
function ProjectForm({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title={t('newProject')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          setBusy(true);
          try {
            await execute('project.create', {
              name: values.get('name'),
              ...(values.get('root') ? { root: values.get('root') } : {}),
            });
            onSaved();
            onClose();
          } catch (e) {
            setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('projectName')}>
          <input name="name" required autoFocus maxLength={160} />
        </Field>
        <Field label={t('root')}>
          <input name="root" maxLength={4096} />
        </Field>
        {error && <p role="alert">{error}</p>}
        <button className="primary full-width" disabled={busy}>
          {t('create')}
        </button>
      </form>
    </Modal>
  );
}
// Opt-in measurement: `?perf=1` renders a fixed sample of frames and exposes the measured result.
const perfRequested = new URLSearchParams(window.location.search).has('perf');
function publishPerf(report: PerfReport) {
  const w = window as unknown as { __aetherPerf?: PerfReport; __aetherPerfHistory?: PerfReport[] };
  w.__aetherPerf = report;
  (w.__aetherPerfHistory ??= []).push(report); // one report per scene mount
}
export function App() {
  const t = useT();
  const prefs = usePreferences();
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const page = (location.pathname.slice(1) || 'office') as Key;
  const [newProject, setNewProject] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [editor, setEditor] = useState(false);
  const [preview, setPreview] = useState<Layout | null>(null);
  const [focus, setFocus] = useState('overview');
  const [tour, dispatchTour] = useReducer(tourReducer, idle);
  const act = (action: TourAction) => {
    const restore = restoreFocus(tour, action, tourReducer(tour, action));
    dispatchTour(action);
    if (restore) setFocus(restore);
  };
  useEffect(() => {
    const target = tourFocus(tour);
    if (target) setFocus(target);
    if (tour.status !== 'playing') return;
    const timer = setTimeout(() => act({ type: 'skip' }), TOUR_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [tour]); // `act` only closes over `tour`, which is this effect's dependency
  const [inspector, setInspector] = useState(true);
  const [menu, setMenu] = useState(false);
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    api<Session>('/api/session')
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setSessionChecked(true));
  }, []);
  useEffect(() => {
    document.documentElement.dataset['theme'] = prefs.theme;
    document.documentElement.lang = prefs.locale === 'zh-TW' ? 'zh-Hant' : 'en';
  }, [prefs.theme, prefs.locale]);
  const projects = useQuery({
    queryKey: ['projects'],
    queryFn: () => api<Project[]>('/api/projects'),
    enabled: !!session,
  });
  const projectId = params.get('project') ?? projects.data?.[0]?.id;
  const selectedId = params.get('agent');
  const snapshot = useQuery({
    queryKey: ['snapshot', projectId],
    queryFn: () => api<Snapshot>(`/api/projects/${projectId}/snapshot`),
    enabled: !!session && !!projectId,
    refetchInterval: 5000,
    retry: 1,
  });
  const local = useQuery({
    queryKey: ['local-sessions'],
    queryFn: () => api<LocalSessionsResponse>('/api/local-sessions'),
    enabled: !!session && ['owner', 'operator'].includes(session.actor.role),
    refetchInterval: 10000,
    retry: false,
  });
  useAdoptRepos(
    local.data?.sessions,
    session?.actor.role === 'owner' && !!local.data?.enabled,
    () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['local-sessions'] });
    },
  );
  useApprovalNotifications(projectId, !!session && prefs.notifyApprovals, t('approvalNeeded'));
  const seq = snapshot.data?.seq;
  useEffect(() => {
    if (!projectId || !session || !seq) return;
    const stream = new EventSource(
      `/api/projects/${projectId}/stream?after=${encodeURIComponent(seq)}`,
    );
    stream.onopen = () => setOffline(false);
    stream.onerror = () => setOffline(true);
    stream.addEventListener('domain', (e) => {
      try {
        eventSchema.parse(JSON.parse((e as MessageEvent).data));
        void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
      } catch {
        setOffline(true);
      }
    });
    stream.addEventListener('fault', () => {
      setOffline(true);
      void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
    });
    return () => stream.close();
  }, [projectId, session, seq, client]);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
  };
  const select = (id: string) => {
    setParams((p) => {
      p.set('agent', id);
      if (projectId) p.set('project', projectId);
      return p;
    });
    setInspector(true);
  };
  const canWrite = !!session && ['owner', 'operator'].includes(session.actor.role);
  if (!sessionChecked)
    return (
      <div className="boot-screen">
        <Orbit size={38} />
        <p>{t('loading')}</p>
      </div>
    );
  if (!session)
    return (
      <Login
        onLogin={(s) => {
          setSession(s);
          void client.invalidateQueries();
        }}
      />
    );
  const data = snapshot.data;
  const observed =
    data && projectId && local.data?.enabled
      ? sessionsToAgents(
          local.data.sessions.filter((s) => s.projectId === projectId),
          projectId,
          Date.now(),
          prefs.locale,
        )
      : [];
  const floorOf = floorResolver(local.data?.sessions ?? []);
  const roleOf = roleResolver(local.data?.sessions ?? []);
  const sceneAgents = data ? [...data.agents, ...observed] : [];
  const selected = sceneAgents.find((a) => a.id === selectedId) ?? null;
  // Recomputed per render on purpose: MessageCarriers dedupes by messageId, so identity does not matter.
  const sceneMessages = (data?.messages ?? []).map((m) => ({
    id: m.id,
    senderId: m.senderId,
    recipientIds: m.deliveries.map((d) => d.recipientId),
  }));
  return (
    <div className="application">
      <header className="topbar">
        <button
          className="icon-button mobile-menu"
          aria-label="Menu"
          onClick={() => setMenu(!menu)}
        >
          <Menu size={21} />
        </button>
        <NavLink to="/office" className="brand">
          <img src="/favicon.svg" width="32" height="32" alt="" />
          <span>
            AETHER<small>OFFICE</small>
          </span>
        </NavLink>
        <span className="top-divider" />
        <div className="project-picker">
          <span className="tiny-label">WORKSPACE</span>
          <select
            aria-label={t('project')}
            value={projectId ?? ''}
            onChange={(e) => {
              setParams({ project: e.target.value });
              setFocus('overview');
            }}
          >
            {projects.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="icon-button add-project"
          aria-label={t('newProject')}
          onClick={() => setNewProject(true)}
          disabled={session.actor.role !== 'owner'}
        >
          <Plus size={17} />
        </button>
        <div className="topbar-right">
          {local.data?.enabled && <Telemetry sessions={local.data.sessions} />}
          {session.mode === 'live' && session.actor.role === 'owner' && projectId && (
            <EmergencyStop projectId={projectId} />
          )}
          <Badge state={session.mode} />
          <button
            className="icon-button"
            aria-label={t('language')}
            title={t('language')}
            onClick={() => prefs.set({ locale: prefs.locale === 'zh-TW' ? 'en' : 'zh-TW' })}
          >
            <Globe2 size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={t('appearance')}
            onClick={() => prefs.set({ theme: prefs.theme === 'dark' ? 'light' : 'dark' })}
          >
            {prefs.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <span className="user-dot">A</span>
        </div>
      </header>
      <div className="app-body">
        <nav className={`sidebar ${menu ? 'open' : ''}`} aria-label={t('project')}>
          <div className="nav-title">WORKSPACE</div>
          {nav.map(([key, Icon]) => (
            <NavLink
              onClick={() => setMenu(false)}
              key={key}
              to={`/${key}${projectId ? `?project=${projectId}` : ''}`}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            >
              <Icon size={18} />
              <span>{t(key)}</span>
              {key === 'tasks' && data?.work.length ? <small>{data.work.length}</small> : null}
              {key === 'messages' && data?.messages.length ? (
                <small>{data.messages.length}</small>
              ) : null}
            </NavLink>
          ))}
          <div className="sidebar-bottom">
            <div className={`connection ${offline ? 'disconnected' : ''}`}>
              <span />
              {offline ? t('offline') : t('connected')}
            </div>
            <small>LOCAL-FIRST · v0.4 DEV</small>
            <button
              className="text-button"
              onClick={async () => {
                try {
                  await api('/api/logout', { method: 'POST', body: '{}' });
                } finally {
                  sessionStorage.removeItem('aether-csrf');
                  setSession(null);
                  client.clear();
                }
              }}
            >
              <LogOut size={14} />
              {t('logout')}
            </button>
          </div>
        </nav>
        <main className={`main-content ${page === 'office' ? 'office-page' : ''}`}>
          {offline && (
            <div className="offline-banner" role="status">
              {t('offline')}
              <button onClick={refresh}>{t('retry')}</button>
            </div>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button aria-label={t('close')} onClick={() => setNotice('')}>
                <X size={15} />
              </button>
            </div>
          )}
          {projects.isPending || (!data && snapshot.isPending && projectId) ? (
            <div className="boot-screen">
              <Orbit size={30} />
              {t('loading')}
            </div>
          ) : projects.error || snapshot.error ? (
            <Empty
              title={t('error')}
              hint={(projects.error ?? snapshot.error)?.message}
              action={
                <button
                  className="secondary"
                  onClick={() => {
                    void projects.refetch();
                    refresh();
                  }}
                >
                  {t('retry')}
                </button>
              }
            />
          ) : !projectId ? (
            <Empty
              title={t('noProjects')}
              action={
                <button className="primary" onClick={() => setNewProject(true)}>
                  {t('newProject')}
                </button>
              }
            />
          ) : (
            data && (
              <>
                {page === 'office' ? (
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
                        <button
                          className="secondary"
                          onClick={() => setInspector(!inspector)}
                          aria-label={t('details')}
                        >
                          <PanelRightClose size={17} />
                        </button>
                        <button
                          className="primary"
                          disabled={!canWrite}
                          onClick={() => setNewTask(true)}
                        >
                          <Plus size={16} />
                          {t('newWork')}
                        </button>
                      </div>
                    </div>
                    <div className="office-stats">
                      <span>
                        <i className="dot mint" />
                        {data.agents.length} {t('agents')}
                      </span>
                      <span>
                        <i className="dot gold" />
                        {data.work.filter((w) => w.state === 'running').length} {t('working')}
                      </span>
                      <span>
                        <i className="dot lilac" />
                        {data.work.filter((w) => w.state === 'reviewing').length} {t('reviewing')}
                      </span>
                      <span className="stats-note">
                        {session.mode === 'demo' ? t('demoNote') : t('live')}
                      </span>
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
                            onChange={(e) =>
                              prefs.set({ quality: e.target.value as typeof prefs.quality })
                            }
                          >
                            {(['low', 'balanced', 'high'] as const).map((q) => (
                              <option key={q} value={q}>
                                {t(q)}
                              </option>
                            ))}
                          </select>
                          {tour.status === 'idle' ? (
                            <button
                              aria-label={t('tourStart')}
                              title={t('tourStart')}
                              onClick={() => act({ type: 'start', restore: focus })}
                            >
                              <Play size={16} />
                            </button>
                          ) : (
                            <>
                              <button
                                aria-label={
                                  tour.status === 'playing' ? t('tourPause') : t('tourResume')
                                }
                                title={tour.status === 'playing' ? t('tourPause') : t('tourResume')}
                                onClick={() =>
                                  act({ type: tour.status === 'playing' ? 'pause' : 'resume' })
                                }
                              >
                                {tour.status === 'playing' ? (
                                  <Pause size={16} />
                                ) : (
                                  <Play size={16} />
                                )}
                              </button>
                              <button
                                aria-label={t('tourSkip')}
                                title={t('tourSkip')}
                                onClick={() => act({ type: 'skip' })}
                              >
                                <SkipForward size={16} />
                              </button>
                              <button
                                aria-label={t('tourStop')}
                                title={t('tourStop')}
                                onClick={() => act({ type: 'stop' })}
                              >
                                <Square size={16} />
                              </button>
                            </>
                          )}
                          <button
                            aria-label={t('reset')}
                            title={t('reset')}
                            onClick={() => setFocus(focus === 'overview' ? 'atrium' : 'overview')}
                          >
                            <RotateCcw size={16} />
                          </button>
                          <button
                            aria-label={t('editLayout')}
                            title={t('editLayout')}
                            disabled={!canWrite}
                            onClick={() => setEditor(true)}
                          >
                            <PencilRuler size={16} />
                          </button>
                        </div>
                      </div>
                      {prefs.view === '3d' ? (
                        <Suspense
                          fallback={
                            <div className="scene-loading">
                              <Orbit size={32} />
                              {t('loading')}
                            </div>
                          }
                        >
                          <OfficeScene
                            agents={sceneAgents}
                            roleOf={roleOf}
                            layout={
                              preview ??
                              mergeLayout(data.layout?.data ?? null, data.agents, observed, floorOf)
                            }
                            selectedId={selectedId}
                            onSelect={select}
                            quality={prefs.quality}
                            reducedMotion={prefs.reducedMotion}
                            locale={prefs.locale}
                            focus={focus}
                            messages={sceneMessages}
                            {...(perfRequested ? { onPerfReport: publishPerf } : {})}
                            onUserCamera={() => act({ type: 'interrupt' })}
                            onMessageUnreachable={() => setNotice(t('messageUnreachable'))}
                            onFailure={() => {
                              prefs.set({ view: '2d' });
                              setNotice(t('sceneFailed'));
                            }}
                          />
                        </Suspense>
                      ) : (
                        <div className="office-2d">
                          <Agents
                            snapshot={data}
                            onSelect={select}
                            onSaved={refresh}
                            canWrite={canWrite}
                          />
                        </div>
                      )}
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
                        {data.agents.map((agent) => (
                          <button
                            className={`team-chip ${agent.id === selectedId ? 'selected' : ''}`}
                            key={agent.id}
                            onClick={() => select(agent.id)}
                          >
                            <AvatarIcon
                              name={agent.name}
                              species={agent.species}
                              color={agent.color}
                            />
                            <div>
                              <strong>{agent.name}</strong>
                              <small>{agent.role}</small>
                            </div>
                            <i
                              className={`dot ${agent.activity === 'working' ? 'mint' : 'quiet'}`}
                            />
                          </button>
                        ))}
                      </div>
                    </section>
                  </>
                ) : (
                  <div className="page-padding">
                    {page === 'agents' ? (
                      <>
                        <Agents
                          snapshot={data}
                          onSelect={select}
                          onSaved={refresh}
                          canWrite={canWrite}
                        />
                        <CapabilityMatrix />
                      </>
                    ) : page === 'tasks' ? (
                      <Tasks
                        snapshot={data}
                        onNew={() => setNewTask(true)}
                        onSaved={refresh}
                        canWrite={canWrite}
                        canExtend={session.actor.role === 'owner'}
                      />
                    ) : page === 'messages' ? (
                      <>
                        <Messages snapshot={data} onSaved={refresh} canWrite={canWrite} />
                        <Rooms projectId={projectId} agents={data.agents} canManage={canWrite} />
                        <Meetings projectId={projectId} agents={data.agents} canManage={canWrite} />
                      </>
                    ) : page === 'observations' ? (
                      <Observations key={projectId} projectId={projectId} />
                    ) : page === 'terminals' ? (
                      <Suspense fallback={<p>{t('loading')}</p>}>
                        <Terminals
                          key={projectId}
                          projectId={projectId}
                          userId={session.actor.id}
                          canWrite={canWrite}
                        />
                      </Suspense>
                    ) : page === 'workspace' ? (
                      <Workspace snapshot={data} />
                    ) : page === 'reviews' ? (
                      <Reviews
                        canRequestReview={canWrite}
                        snapshot={data}
                        onSaved={refresh}
                        canReview={['owner', 'reviewer'].includes(session.actor.role)}
                        canAccept={session.actor.role === 'owner'}
                      />
                    ) : page === 'approvals' ? (
                      <Approvals projectId={projectId} />
                    ) : page === 'knowledge' ? (
                      <>
                        <Knowledge
                          projectId={projectId}
                          canWrite={canWrite}
                          canApprove={session.actor.role === 'owner'}
                          workItems={data.work}
                        />
                        <Skills projectId={projectId} canManage={session.actor.role === 'owner'} />
                      </>
                    ) : page === 'history' ? (
                      <History projectId={projectId} />
                    ) : page === 'machines' ? (
                      <>
                        <PageHeading title={t('machines')} subtitle={t('machineHint')} />
                        {data.runner.length ? (
                          <div className="machine-grid">
                            {data.runner.map((machine) => (
                              <article className="panel machine-card" key={machine.id}>
                                <Server size={26} />
                                <h2>{machine.name}</h2>
                                <Badge
                                  state={machine.state === 'online' ? 'online' : 'machineOffline'}
                                />
                                <p>
                                  {t('lastSeen')}: {new Date(machine.lastSeen).toLocaleTimeString()}
                                </p>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <Empty title={t('noMachines')} hint={t('machineHint')} />
                        )}
                        <MachineInvite
                          projectId={projectId}
                          canInvite={session.actor.role === 'owner'}
                        />
                      </>
                    ) : page === 'settings' ? (
                      <>
                        <PageHeading title={t('settings')} />
                        <div className="settings-panel panel">
                          <Field label={t('language')}>
                            <select
                              value={prefs.locale}
                              onChange={(e) =>
                                prefs.set({ locale: e.target.value as typeof prefs.locale })
                              }
                            >
                              <option value="zh-TW">繁體中文</option>
                              <option value="en">English</option>
                            </select>
                          </Field>
                          <Field label={t('appearance')}>
                            <select
                              value={prefs.theme}
                              onChange={(e) =>
                                prefs.set({ theme: e.target.value as typeof prefs.theme })
                              }
                            >
                              <option value="dark">{t('dark')}</option>
                              <option value="light">{t('light')}</option>
                            </select>
                          </Field>
                          <label className="toggle-label">
                            <span>{t('motion')}</span>
                            <input
                              type="checkbox"
                              checked={prefs.reducedMotion}
                              onChange={(e) => prefs.set({ reducedMotion: e.target.checked })}
                            />
                          </label>
                          <p className="muted">
                            {session.mode === 'demo' ? t('demoNote') : t('runnerGrantRequired')}
                          </p>
                        </div>
                        <Schedules projectId={projectId} canManage={canWrite} />
                        <A2AClients
                          projectId={projectId}
                          canManage={session.actor.role === 'owner'}
                        />
                        <Integrations
                          projectId={projectId}
                          canManage={session.actor.role === 'owner'}
                        />
                        {session.mode === 'live' && (
                          <ExecutionSettings
                            projectId={projectId}
                            canConfigure={session.actor.role === 'owner'}
                          />
                        )}
                      </>
                    ) : (
                      <Empty title={t('empty')} />
                    )}
                  </div>
                )}
                {newTask && (
                  <TaskForm snapshot={data} onClose={() => setNewTask(false)} onSaved={refresh} />
                )}
                {editor && (
                  <Suspense fallback={null}>
                    <LayoutEditor
                      snapshot={data}
                      onClose={() => setEditor(false)}
                      onSaved={refresh}
                      onPreview={setPreview}
                    />
                  </Suspense>
                )}
              </>
            )
          )}
        </main>
        {inspector && data && (
          <Inspector
            agent={selected}
            session={
              local.data?.sessions.find((x) => x.key === sessionIdOf(selected?.id ?? '')) ?? null
            }
            snapshot={data}
            onClose={() => setInspector(false)}
            onFocus={() => {
              if (selected) setFocus(selected.id);
            }}
          />
        )}
      </div>
      {newProject && (
        <ProjectForm onClose={() => setNewProject(false)} onSaved={() => void projects.refetch()} />
      )}
    </div>
  );
}
