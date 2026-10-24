import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Orbit } from 'lucide-react';
import type { Session } from './lib/api/api-session.js';
import { useTheme } from './lib/preferences/state.js';
import { useT, useLocale } from './ui/useT.js';
import { ReasonDefs } from './ui/ReasonDefs.js';
import { usePhone } from './lib/preferences/phone.js';
import { useApplication } from './lib/app/app-state.js';
import { useAuthSession, useDocumentChrome, useSignedOutTitle } from './lib/app/app-hooks.js';
import {
  AppMain,
  AppNavigation,
  AppNeedBanner,
  AppPanel,
  AppTopbar,
} from './features/shell-chrome/AppFrame.js';
import { ProjectForm } from './features/integrations/ProjectForm.js';
import { TabBar } from './features/shell-chrome/TabBar.js';
import { isFieldPerfRequested } from './features/field-perf/is-field-perf-requested.js';

const Login = lazy(() =>
  import('./features/shell-chrome/Login.js').then((m) => ({ default: m.Login })),
);

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

export function App() {
  const t = useT();
  const theme = useTheme();
  const locale = useLocale();
  const client = useQueryClient();
  const { session, setSession, checked, logout } = useAuthSession();
  useDocumentChrome(theme, locale);
  useSignedOutTitle(!!session);
  const booting = (
    <div className="boot-screen">
      <Orbit size={38} />
      <p>{t('loading')}</p>
    </div>
  );
  let body: ReactNode;
  if (!checked) body = booting;
  else if (!session)
    body = (
      <Suspense fallback={booting}>
        <Login
          onLogin={(s) => {
            setSession(s);
            void client.invalidateQueries();
          }}
        />
      </Suspense>
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
  const phone = usePhone();
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
      <AppNeedBanner app={app} />
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
