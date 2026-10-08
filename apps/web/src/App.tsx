import { useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Orbit } from 'lucide-react';
import type { Session } from './lib/api/api-session.js';
import { useTheme } from './lib/preferences/state.js';
import { useT, useLocale } from './ui/useT.js';
import { ReasonDefs } from './ui/ReasonDefs.js';
import { usePhone } from './lib/preferences/phone.js';
import { useApplication } from './lib/app/app-state.js';
import { useAuthSession, useDocumentChrome, useSignedOutTitle } from './lib/app/app-hooks.js';
import { AppMain, AppNavigation, AppPanel, AppTopbar } from './features/shell-chrome/AppFrame.js';
import { Login } from './features/shell-chrome/Login.js';
import { ProjectForm } from './features/integrations/ProjectForm.js';
import { TabBar } from './features/shell-chrome/TabBar.js';
import { isFieldPerfRequested } from './features/field-perf/is-field-perf-requested.js';

const fieldPerfOverlay =
  typeof window !== 'undefined' && isFieldPerfRequested(window.location.search);

function FieldPerfOverlay() {
  const [Panel, setPanel] = useState<ComponentType | null>(null);
  useEffect(() => {
    if (!fieldPerfOverlay) return;
    void import('./features/field-perf/FieldPerfPanel.js').then((m) =>
      setPanel(() => m.FieldPerfPanel),
    );
  }, []);
  if (!Panel) return null;
  return <Panel />;
}

/** Signed out: the login; signed in: the application. */
export function App() {
  const t = useT();
  const theme = useTheme();
  const locale = useLocale();
  const client = useQueryClient();
  const { session, setSession, checked, logout } = useAuthSession();
  useDocumentChrome(theme, locale);
  useSignedOutTitle(!!session);
  let body: ReactNode;
  if (!checked)
    body = (
      <div className="boot-screen">
        <Orbit size={38} />
        <p>{t('loading')}</p>
      </div>
    );
  else if (!session)
    body = (
      <Login
        onLogin={(s) => {
          setSession(s);
          void client.invalidateQueries();
        }}
      />
    );
  else body = <Application session={session} onLogout={logout} />;
  return (
    <>
      {body}
      {fieldPerfOverlay ? <FieldPerfOverlay /> : null}
    </>
  );
}

function Application({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const t = useT();
  const app = useApplication(session);
  const { shell, sel } = app;
  const phone = usePhone(); // portrait: tab bar
  return (
    <div className="application">
      <ReasonDefs />
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
        }}
      >
        {t('skipToMain')}
      </a>
      <AppTopbar app={app} />
      <div className="app-body">
        <AppNavigation app={app} onLogout={onLogout} />
        <AppMain app={app} />
        <AppPanel app={app} />
      </div>
      {phone && (
        <TabBar
          projectId={sel.projectId}
          advanced={app.prefs.advanced}
          counts={app.needs}
          moreOpen={shell.menu}
          onMore={() => shell.setMenu(!shell.menu)}
        />
      )}
      {shell.newProject && (
        <ProjectForm
          onClose={() => shell.setNewProject(false)}
          onSaved={() => void sel.projects.refetch()}
        />
      )}
    </div>
  );
}
