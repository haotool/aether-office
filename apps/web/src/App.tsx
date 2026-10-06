import { lazy, Suspense, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Orbit, X } from 'lucide-react';
import type { Layout, Project, Snapshot } from '@aether/contracts';
import { api } from './api.js';
import { usePreferences } from './state.js';
import { isOperator } from './roles.js';
import { useT, Empty } from './ui.js';
import type { Key } from './i18n.js';
import { TaskForm } from './features/TaskForm.js';
import { SessionPanel } from './features/SessionPanel.js';
import { SessionSheet, type SheetHeight } from './features/SessionSheet.js';
import { attentionKeys } from './features/feed-model.js';
import { useSessionFeed } from './features/use-session-feed.js';
import { AppQuickOpen } from './features/AppQuickOpen.js';
import { Login } from './features/Login.js';
import { OfficePage } from './features/OfficePage.js';
import { ProjectForm } from './features/ProjectForm.js';
import { ProjectPage } from './features/ProjectPage.js';
import { Sidebar } from './features/Sidebar.js';
import { PhoneOffice } from './features/PhoneOffice.js';
import { QuickPrefs } from './features/QuickPrefs.js';
import { TabBar } from './features/TabBar.js';
import { PwaNotices } from './features/PwaNotices.js';
import { Telemetry } from './features/Telemetry.js';
import { Topbar } from './features/Topbar.js';
import { useBeats } from './features/activity-rate.js';
import { needsYou, sessionsNeedingYou, sessionsWaiting } from './features/needs-you.js';
import { askingKeys, usePermissionRequests } from './features/permission-requests.js';
import { useLeaving } from './features/clock-out.js';
import { officeModel } from './features/office-model.js';
import { usePhone, usePhoneAny } from './phone.js';
import { useLocalSessions, usePendingApprovals } from './app-data.js';
import { sessionIdOf } from './localSessions.js';
import { useApprovalNotifications, useNotificationPermission } from './notifications.js';
import {
  focusFeedRow,
  useDocumentChrome,
  useFocusRequest,
  useProjectStream,
  useAuthSession,
  useQuickOpen,
  useSessionNotices,
  useTour,
} from './app-hooks.js';

const LayoutEditor = lazy(() =>
  import('./features/LayoutEditor.js').then((m) => ({ default: m.LayoutEditor })),
);

export function App() {
  const t = useT();
  const prefs = usePreferences();
  const client = useQueryClient();
  const { session, setSession, checked: sessionChecked, logout } = useAuthSession();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const page = (location.pathname.slice(1) || 'office') as Key;
  const [newProject, setNewProject] = useState(false);
  const [newTask, setNewTask] = useState(false);
  const [editor, setEditor] = useState(false);
  const [preview, setPreview] = useState<Layout | null>(null);
  const [focus, setFocus] = useState('overview');
  const { tour, act } = useTour(setFocus);
  // A narrow desktop window shows the panel as an overlay on the office: closed until asked for.
  const [panelOpen, setPanelOpen] = useState(() => window.innerWidth > 1000);
  const [sheet, setSheet] = useState<SheetHeight>('peek');
  const [menu, setMenu] = useState(false);
  const quick = useQuickOpen();
  const phone = usePhone(); // portrait: tab bar
  const compact = usePhoneAny(); // portrait or on its side: immersive office, sheets
  const [offline, setOffline] = useState(false);
  const [notice, setNotice] = useState('');
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
    // The event stream refreshes it the moment something changes; polling is only the net under it.
    refetchInterval: offline ? 5000 : 30000,
    retry: 1,
  });
  const local = useLocalSessions(session);
  const beats = useBeats(local.data?.sessions);
  const leaving = useLeaving((s) => s.leaving);
  const pendingApprovals = usePendingApprovals(session, projectId);
  // An alert is a browser notification when permitted, otherwise a notice in the page; a tap opens what it is about.
  const sink = useMemo(
    () => ({ toast: setNotice, open: (to: string) => navigate(to) }),
    [navigate],
  );
  const requests = usePermissionRequests(isOperator(session?.actor.role));
  const asking = useMemo(() => askingKeys(requests), [requests]);
  useNotificationPermission(!!session && prefs.notify);
  useApprovalNotifications(
    projectId,
    !!session && prefs.notify,
    {
      title: t('approvalNeeded'),
      project: projects.data?.find((p) => p.id === projectId)?.name ?? '',
    },
    sink,
  );
  useSessionNotices(
    local.data?.sessions,
    prefs.notify,
    { needsYou: t('sessionNeedsYou'), finished: t('sessionFinished') },
    sink,
    asking,
  );
  const canWrite = isOperator(session?.actor.role);
  const data = snapshot.data;
  const needs = needsYou(
    data,
    pendingApprovals,
    sessionsNeedingYou(sessionsWaiting(local.data?.sessions, Date.now()), asking),
  );
  // The tab's title carries what needs the person, so it shows in a background tab.
  useDocumentChrome(
    prefs.theme,
    prefs.locale,
    needs.approvals + needs.sessions + (prefs.advanced ? needs.tasks + needs.messages : 0),
  );
  useProjectStream(projectId, !!session, snapshot.data?.seq, setOffline);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ['snapshot', projectId] });
  };
  const select = (id: string) => {
    setParams((p) => {
      p.set('agent', id);
      if (projectId) p.set('project', projectId);
      return p;
    });
    setPanelOpen(true);
  };
  // The character menu: the conversation (the full sheet on a phone), or the feed with the member's row brought into view.
  const openConversation = (id: string) => {
    select(id);
    if (compact) setSheet('full');
  };
  const showInFeed = (id: string) => {
    setParams((p) => {
      p.delete('agent');
      return p;
    });
    setPanelOpen(true);
    if (compact) setSheet('half');
    focusFeedRow(id);
  };
  const model = officeModel(data, local.data?.sessions, projectId, prefs.locale, beats, leaving);
  const selected = model.agents.find((a) => a.id === selectedId) ?? null;
  const selectedKey = selectedId ? sessionIdOf(selectedId) : null;
  const selectedSession = local.data?.sessions.find((x) => x.key === selectedKey) ?? null;
  const feed = useSessionFeed(local.data?.sessions, selectedKey);
  const unread = attentionKeys(feed); // the same sessions every badge counts
  const deselect = () =>
    setParams((p) => {
      p.delete('agent');
      return p;
    });
  useFocusRequest(params, setParams, selected?.id, setFocus);
  // A row of the feed: the office of the session's own project, with the camera on its desk.
  const open = (id: string) => {
    const own = local.data?.sessions.find((x) => x.key === sessionIdOf(id))?.projectId;
    if (own && own !== projectId) setParams({ project: own, agent: id, focus: '1' });
    else {
      select(id);
      setFocus(id);
    }
  };
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
  return (
    <div className="application">
      <Topbar
        session={session}
        projects={projects.data ?? []}
        projectId={projectId}
        sessions={local.data?.enabled ? local.data.sessions : null}
        unread={unread.size}
        updatedAt={local.dataUpdatedAt}
        offline={offline}
        onMenu={() => setMenu(!menu)}
        onProject={(id) => {
          setParams({ project: id });
          setFocus('overview');
        }}
        onNewProject={() => setNewProject(true)}
      />
      <div className="app-body">
        <Sidebar
          open={menu}
          projects={projects.data ?? []}
          projectId={projectId}
          advanced={prefs.advanced}
          workCount={needs.tasks}
          messageCount={needs.messages}
          approvalCount={needs.approvals}
          sessionCount={needs.sessions}
          offline={offline}
          onNavigate={() => setMenu(false)}
          onLogout={logout}
          onProject={(id) => {
            setParams({ project: id });
            setFocus('overview');
            setMenu(false);
          }}
          footer={
            <>
              <QuickPrefs canPair={canWrite} />
              {local.data?.enabled ? (
                <Telemetry sessions={local.data.sessions} unread={unread.size} />
              ) : null}
            </>
          }
        />
        {menu && (
          <button
            className="sidebar-backdrop"
            aria-label={t('close')}
            onClick={() => setMenu(false)}
          />
        )}
        {quick.open && (
          <AppQuickOpen
            page={page}
            advanced={prefs.advanced}
            projectId={projectId}
            projects={projects.data ?? []}
            sessions={local.data?.sessions ?? []}
            onClose={() => quick.setOpen(false)}
          />
        )}
        <main
          className={`main-content ${page === 'office' ? 'office-page' : ''} ${compact && page === 'office' ? 'immersive' : ''}`}
        >
          {offline && (
            <div className="offline-banner" role="status">
              {t('offline')}
              <button onClick={refresh}>{t('retry')}</button>
            </div>
          )}
          <PwaNotices />
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
                {page === 'office' && compact ? (
                  <PhoneOffice
                    data={data}
                    model={model}
                    selectedId={selectedId}
                    focus={focus}
                    preview={preview}
                    unread={unread}
                    canWrite={canWrite}
                    sessions={local.data?.sessions ?? []}
                    owner={session.actor.role === 'owner'}
                    covered={sheet === 'full'}
                    onSelect={select}
                    onOpen={openConversation}
                    onFeed={showInFeed}
                    onFocus={setFocus}
                    onTour={act}
                    onNewTask={() => setNewTask(true)}
                    onNotice={setNotice}
                    onRefresh={refresh}
                  />
                ) : page === 'office' ? (
                  <OfficePage
                    data={data}
                    session={session}
                    model={model}
                    projectId={projectId}
                    selectedId={selectedId}
                    focus={focus}
                    tour={tour}
                    preview={preview}
                    unread={unread}
                    canWrite={canWrite}
                    onSelect={select}
                    onOpen={openConversation}
                    onFeed={showInFeed}
                    onFocus={setFocus}
                    onTour={act}
                    onTogglePanel={() => setPanelOpen(!panelOpen)}
                    onNewTask={() => setNewTask(true)}
                    onEditLayout={() => setEditor(true)}
                    onNotice={setNotice}
                    onRefresh={refresh}
                  />
                ) : (
                  <ProjectPage
                    page={page}
                    data={data}
                    session={session}
                    projectId={projectId}
                    sessions={local.data?.sessions ?? []}
                    canWrite={canWrite}
                    onSelect={select}
                    onRefresh={refresh}
                    onNewTask={() => setNewTask(true)}
                  />
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
        {compact && data && page === 'office' && (
          <SessionSheet
            height={sheet}
            onHeight={setSheet}
            agent={selected}
            session={selectedSession}
            snapshot={data}
            feed={feed}
            onOpen={open}
            onBack={deselect}
            onFocus={() => selected && setFocus(selected.id)}
          />
        )}
        {!compact && panelOpen && data && (
          <SessionPanel
            agent={selected}
            session={selectedSession}
            snapshot={data}
            feed={feed}
            onOpen={open}
            onBack={deselect}
            onFocus={() => selected && setFocus(selected.id)}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
      {phone && (
        <TabBar
          projectId={projectId}
          advanced={prefs.advanced}
          counts={needs}
          moreOpen={menu}
          onMore={() => setMenu(!menu)}
        />
      )}
      {newProject && (
        <ProjectForm onClose={() => setNewProject(false)} onSaved={() => void projects.refetch()} />
      )}
    </div>
  );
}
