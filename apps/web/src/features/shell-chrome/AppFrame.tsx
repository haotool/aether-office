import { lazy, Suspense } from 'react';
import { X } from 'lucide-react';
import { useT } from '../../ui/useT.js';
import type { Application } from '../../lib/app/app-state.js';
import { useQuickOpen } from '../../lib/app/app-hooks.js';
import { AppContent } from './AppContent.js';
import { AppQuickOpen } from './AppQuickOpen.js';
import { QuickPrefs } from './QuickPrefs.js';
import { PwaNotices } from './PwaNotices.js';
import { SessionPanel } from '../sessions/SessionPanel.js';
import { SessionSheet } from '../sessions/SessionSheet.js';
import { Sidebar } from './Sidebar.js';
import { Telemetry } from '../kpi/Telemetry.js';
import { Topbar } from './Topbar.js';
import { LOCAL_PREFIX } from '../../lib/sessions/session-names.js';

const NeedBanner = lazy(() => import('./NeedBanner.js').then((m) => ({ default: m.NeedBanner })));

export function AppTopbar({ app }: { app: Application }) {
  const { session, sel, local, shell, view } = app;
  return (
    <Topbar
      session={session}
      projects={sel.projects.data ?? []}
      projectId={sel.projectId}
      sessions={local.data?.enabled ? local.data.sessions : null}
      unread={view.unread.size}
      updatedAt={local.dataUpdatedAt}
      offline={shell.offline}
      onMenu={() => shell.setMenu(!shell.menu)}
      onProject={(id) => {
        sel.setParams({ project: id });
        shell.setFocus('overview');
      }}
      onNewProject={() => shell.setNewProject(true)}
    />
  );
}

export function AppNeedBanner({ app }: { app: Application }) {
  return (
    <Suspense fallback={null}>
      <NeedBanner
        sessions={app.local.data?.sessions}
        asking={app.asking}
        notify={app.prefs.notify}
        onOpen={(key) => app.pick.open(`${LOCAL_PREFIX}${key}`)}
      />
    </Suspense>
  );
}

function SidebarFooter({ app }: { app: Application }) {
  const { local, view } = app;
  return (
    <>
      <QuickPrefs canPair={app.canWrite} />
      {local.data?.enabled ? (
        <Telemetry sessions={local.data.sessions} unread={view.unread.size} />
      ) : null}
    </>
  );
}

export function AppNavigation({ app, onLogout }: { app: Application; onLogout: () => void }) {
  const t = useT();
  const { prefs, sel, local, shell, needs } = app;
  const quick = useQuickOpen();
  const projects = sel.projects.data ?? [];
  return (
    <>
      <Sidebar
        open={shell.menu}
        projects={projects}
        projectId={sel.projectId}
        advanced={prefs.advanced}
        workCount={needs.tasks}
        messageCount={needs.messages}
        approvalCount={needs.approvals}
        sessionCount={needs.sessions}
        offline={shell.offline}
        onNavigate={() => shell.setMenu(false)}
        onLogout={onLogout}
        onProject={(id) => {
          sel.setParams({ project: id });
          shell.setFocus('overview');
          shell.setMenu(false);
        }}
        footer={<SidebarFooter app={app} />}
      />
      {shell.menu && (
        <button
          className="sidebar-backdrop"
          aria-label={t('close')}
          onClick={() => shell.setMenu(false)}
        />
      )}
      {quick.open && (
        <AppQuickOpen
          page={sel.page}
          advanced={prefs.advanced}
          projectId={sel.projectId}
          projects={projects}
          sessions={local.data?.sessions ?? []}
          onClose={() => quick.setOpen(false)}
        />
      )}
    </>
  );
}

export function AppMain({ app }: { app: Application }) {
  const t = useT();
  const { session, shell, sel, local, view, pick, compact } = app;
  const immersive = compact && sel.page === 'office' && !view.quiet;
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className={`main-content ${sel.page === 'office' ? 'office-page' : ''} ${immersive ? 'immersive' : ''}`}
    >
      {shell.offline && (
        <div className="offline-banner" role="status">
          {t('offline')}
          <button onClick={app.refresh}>{t('retry')}</button>
        </div>
      )}
      <PwaNotices />
      {shell.notice && (
        <div className="notice" role="status">
          {shell.notice}
          <button aria-label={t('close')} onClick={() => shell.setNotice('')}>
            <X size={15} />
          </button>
        </div>
      )}
      <AppContent
        {...{ session, page: sel.page, unknownPage: sel.unknownPage, projectId: sel.projectId }}
        {...{
          projects: sel.projects,
          snapshot: sel.snapshot,
          sessions: local.data?.sessions ?? [],
        }}
        {...{ quiet: view.quiet, compact, covered: shell.sheet === 'full', model: view.model }}
        {...{ selectedId: sel.selectedId, focus: shell.focus, tour: app.tour }}
        {...{ preview: shell.preview, unread: view.unread, canWrite: app.canWrite }}
        {...{ onSelect: pick.select, onOpen: pick.openConversation, onFeed: pick.showInFeed }}
        {...{ onFocus: shell.setFocus, onTour: app.act, onPreview: shell.setPreview }}
        {...{ onTogglePanel: () => shell.setPanelOpen(!shell.panelOpen) }}
        {...{ onNewProject: () => shell.setNewProject(true), onNotice: shell.setNotice }}
        onRefresh={app.refresh}
      />
    </main>
  );
}

export function AppPanel({ app }: { app: Application }) {
  const { sel, shell, view, pick, compact } = app;
  const data = sel.snapshot.data;
  if (!data) return null;
  const common = {
    agent: view.selected,
    session: view.selectedSession,
    snapshot: data,
    feed: view.feed,
    onOpen: pick.open,
    onBack: pick.deselect,
    onFocus: () => view.selected && shell.setFocus(view.selected.id),
  };
  if (compact)
    return sel.page === 'office' ? (
      <SessionSheet {...common} height={shell.sheet} onHeight={shell.setSheet} />
    ) : null;
  return shell.panelOpen ? (
    <SessionPanel {...common} onClose={() => shell.setPanelOpen(false)} />
  ) : null;
}
