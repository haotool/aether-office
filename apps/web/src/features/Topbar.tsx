import { NavLink } from 'react-router-dom';
import { Globe2, Menu, Moon, Plus, Sun } from 'lucide-react';
import type { LocalSessionsResponse, Project } from '@aether/contracts';
import type { Session } from '../api.js';
import { usePreferences } from '../state.js';
import { useT, Badge } from '../ui.js';
import { EmergencyStop } from './EmergencyStop.js';
import { Telemetry } from './Telemetry.js';

/** Brand, project picker and the controls that belong to the person: language, theme, live-mode stop. */
export function Topbar({
  session,
  projects,
  projectId,
  sessions,
  unread,
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
  onMenu: () => void;
  onProject: (projectId: string) => void;
  onNewProject: () => void;
}) {
  const t = useT();
  const prefs = usePreferences();
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
        <select
          aria-label={t('project')}
          value={projectId ?? ''}
          onChange={(e) => onProject(e.target.value)}
        >
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
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
        {sessions && <Telemetry sessions={sessions} unread={unread} />}
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
  );
}
