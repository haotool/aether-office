import { useQueryClient } from '@tanstack/react-query';
import { Orbit } from 'lucide-react';
import type { Session } from './api.js';
import { usePreferences, useTheme } from './state.js';
import { useT } from './ui.js';
import { usePhone } from './phone.js';
import { useApplication } from './app-state.js';
import { useAuthSession, useDocumentChrome, useSignedOutTitle } from './app-hooks.js';
import { AppMain, AppNavigation, AppPanel, AppTopbar } from './features/AppFrame.js';
import { Login } from './features/Login.js';
import { ProjectForm } from './features/ProjectForm.js';
import { TabBar } from './features/TabBar.js';

/** Signed out: the login; signed in: the application. */
export function App() {
  const t = useT();
  const theme = useTheme();
  const locale = usePreferences((s) => s.locale);
  const client = useQueryClient();
  const { session, setSession, checked, logout } = useAuthSession();
  useDocumentChrome(theme, locale);
  useSignedOutTitle(!!session);
  if (!checked)
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
  return <Application session={session} onLogout={logout} />;
}

function Application({ session, onLogout }: { session: Session; onLogout: () => void }) {
  const t = useT();
  const app = useApplication(session);
  const { shell, sel } = app;
  const phone = usePhone(); // portrait: tab bar
  return (
    <div className="application">
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
