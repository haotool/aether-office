import { NavLink } from 'react-router-dom';
import { Globe2, Menu, Moon, Plus, Sun } from 'lucide-react';
import type { LocalSessionsResponse, Project } from '@aether/contracts';
import type { Session } from '../api.js';
import { useT, Badge } from '../ui.js';
import { ProjectSelect } from './ProjectSelect.js';
import { useLocaleToggle, useThemeToggle } from './PreferenceControls.js';
import { PairPhoneButton } from './ConnectPhone.js';
import { EmergencyStop } from './EmergencyStop.js';
import { ConnectionStatus } from './ConnectionStatus.js';
import { Telemetry } from './Telemetry.js';
import { isOperator } from '../roles.js';

/** Brand, project picker and the controls that belong to the person: language, theme, live-mode stop. */
export function Topbar({
  session,
  projects,
  projectId,
  sessions,
  unread,
  updatedAt,
  offline,
  onMenu,
  onProject,
  onNewProject,
}: {
  session: Session;
  projects: readonly Project[];
  projectId: string | undefined;
  /** The local sessions to summarise, or null when local discovery is off. */
  sessions: LocalSessionsResponse['sessions'] | null;
  unread: number;
  /** When the local sessions last arrived (ms epoch), and whether the project stream is down. */
  updatedAt: number;
  offline: boolean;
  onMenu: () => void;
  onProject: (projectId: string) => void;
  onNewProject: () => void;
}) {
  const t = useT();
  const locale = useLocaleToggle();
  const theme = useThemeToggle();
  return (
    <header className="topbar">
      <button className="icon-button mobile-menu" aria-label="Menu" onClick={onMenu}>
        <Menu size={21} />
      </button>
      <NavLink to="/office" className="brand" aria-label="AETHER OFFICE">
        <img src="/favicon.svg" width="32" height="32" alt="" />
        <span>
          AETHER<small>OFFICE</small>
        </span>
      </NavLink>
      <span className="top-divider" />
      <div className="project-picker">
        <span className="tiny-label">WORKSPACE</span>
        <ProjectSelect
          projects={projects}
          projectId={projectId}
          onProject={onProject}
          title={projects.find((p) => p.id === projectId)?.name}
        />
      </div>
      <button
        className="icon-button add-project"
        aria-label={t('newProject')}
        onClick={onNewProject}
        disabled={session.actor.role !== 'owner'}
      >
        <Plus size={17} />
      </button>
      <div className="topbar-right">
        {sessions && <ConnectionStatus updatedAt={updatedAt} offline={offline} />}
        {sessions && <Telemetry sessions={sessions} unread={unread} />}
        {session.mode === 'live' && session.actor.role === 'owner' && projectId && (
          <EmergencyStop projectId={projectId} />
        )}
        <Badge state={session.mode} />
        {isOperator(session.actor.role) && <PairPhoneButton variant="icon" />}
        <button
          className="icon-button"
          aria-label={t('language')}
          title={t('language')}
          onClick={locale.toggle}
        >
          <Globe2 size={18} />
        </button>
        <button className="icon-button" aria-label={t('appearance')} onClick={theme.toggle}>
          {theme.theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
        <span className="user-dot">A</span>
      </div>
    </header>
  );
}
