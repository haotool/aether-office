import { lazy, Suspense, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useSearchParams } from 'react-router-dom';
import { Orbit, X } from 'lucide-react';
import type { Layout, LocalSessionsResponse, Project, Snapshot } from '@aether/contracts';
import { api, forgetCsrf, type Session } from './api.js';
import { usePreferences } from './state.js';
import { useT, Empty } from './ui.js';
import type { Key } from './i18n.js';
import { TaskForm } from './features/Tasks.js';
import { Inspector } from './features/Inspector.js';
import { AppQuickOpen } from './features/AppQuickOpen.js';
import { Login } from './features/Login.js';
import { OfficePage } from './features/OfficePage.js';
import { ProjectForm } from './features/ProjectForm.js';
import { ProjectPage } from './features/ProjectPage.js';
import { Sidebar } from './features/Sidebar.js';
import { MemberSheet } from './features/MemberSheet.js';
import { PhoneOffice } from './features/PhoneOffice.js';
import { QuickPrefs } from './features/QuickPrefs.js';
import { TabBar } from './features/TabBar.js';
import { Telemetry } from './features/Telemetry.js';
import { Topbar } from './features/Topbar.js';
import { useBeats } from './features/activity-rate.js';
import { needsYou } from './features/needs-you.js';
import { useLeaving } from './features/clock-out.js';
import { officeModel } from './features/office-model.js';
import { usePhone, usePhoneAny } from './phone.js';
import { useAdoptRepos } from './adoptProjects.js';
import { sessionIdOf } from './localSessions.js';
import { useApprovalNotifications } from './notifications.js';
import { useProjectStream, useQuickOpen, useTour, useUnreadSessions } from './app-hooks.js';

const LayoutEditor = lazy(() =>
  import('./features/LayoutEditor.js').then((m) => ({ default: m.LayoutEditor })),
);

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
  const { tour, act } = useTour(focus, setFocus);
  const [inspector, setInspector] = useState(true);
  const [menu, setMenu] = useState(false);
  const quick = useQuickOpen();
  const phone = usePhone(); // portrait: tab bar
  const compact = usePhoneAny(); // portrait or on its side: immersive office, sheets
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
    // The event stream refreshes it the moment something changes; polling is only the net under it.
    refetchInterval: offline ? 5000 : 30000,
    retry: 1,
  });
  const local = useQuery({
    queryKey: ['local-sessions'],
    queryFn: () => api<LocalSessionsResponse>('/api/local-sessions'),
    enabled: !!session && ['owner', 'operator'].includes(session.actor.role),
    // Looked at more often while something is working, so how hard it works can be told (activity-rate.ts).
    refetchInterval: (q) =>
      q.state.data?.sessions.some((s) => s.hook?.activity === 'working') ? 4000 : 10000,
    retry: false,
  });
  const beats = useBeats(local.data?.sessions);
  const leaving = useLeaving((s) => s.leaving);
  // Shares the approvals page's cache; looked at every few seconds so the badge on "more" means something.
  const approvals = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: () => api<{ state: string }[]>(`/api/projects/${projectId}/approvals`),
    enabled: !!session && !!projectId && phone,
    refetchInterval: 5000,
    retry: false,
  });
  const pendingApprovals = approvals.data?.filter((a) => a.state === 'pending').length ?? 0;
  useAdoptRepos(
    local.data?.sessions,
    session?.actor.role === 'owner' && !!local.data?.enabled,
    () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['local-sessions'] });
    },
  );
  useApprovalNotifications(projectId, !!session && prefs.notifyApprovals, t('approvalNeeded'));
  const unread = useUnreadSessions(local.data?.sessions, selectedId, prefs.notifyApprovals, {
    needsYou: t('sessionNeedsYou'),
    finished: t('sessionFinished'),
  });
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
    setInspector(true);
  };
  // A pairing link opened where a session already exists: its code is no use here, and does not stay in the address bar.
  useEffect(() => {
    if (session && window.location.hash.startsWith('#pair='))
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }, [session]);
  const canWrite = !!session && ['owner', 'operator'].includes(session.actor.role);
  const logout = async () => {
    try {
      await api('/api/logout', { method: 'POST', body: '{}' });
    } finally {
      forgetCsrf();
      setSession(null);
      client.clear();
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
  const data = snapshot.data;
  const needs = needsYou(data, pendingApprovals);
  const model = officeModel(data, local.data?.sessions, projectId, prefs.locale, beats, leaving);
  const selected = model.agents.find((a) => a.id === selectedId) ?? null;
  return (
    <div className="application">
      <Topbar
        session={session}
        projects={projects.data ?? []}
        projectId={projectId}
        sessions={local.data?.enabled ? local.data.sessions : null}
        unread={unread.size}
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
          workCount={needs.tasks}
          messageCount={needs.messages}
          approvalCount={needs.more}
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
              <QuickPrefs />
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
                    onSelect={select}
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
                    onFocus={setFocus}
                    onTour={act}
                    onToggleInspector={() => setInspector(!inspector)}
                    onNewTask={() => setNewTask(true)}
                    onEditLayout={() => setEditor(true)}
                    onNotice={setNotice}
                    onRefresh={refresh}
                    focusSelected={params.get('focus') === '1'}
                    onFocusHandled={() =>
                      setParams(
                        (p) => {
                          p.delete('focus');
                          return p;
                        },
                        { replace: true },
                      )
                    }
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
        {compact && data && selected ? (
          <MemberSheet
            key={selected.id}
            agent={selected}
            session={local.data?.sessions.find((x) => x.key === sessionIdOf(selected.id)) ?? null}
            snapshot={data}
            onClose={() =>
              setParams((p) => {
                p.delete('agent');
                return p;
              })
            }
            onFocus={() => setFocus(selected.id)}
          />
        ) : null}
        {!compact && inspector && data && (
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
      {phone && (
        <TabBar
          projectId={projectId}
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
