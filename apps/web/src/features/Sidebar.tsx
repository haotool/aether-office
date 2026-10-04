import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import type { Project } from '@aether/contracts';
import { nav, pageLink } from '../nav.js';
import { useT } from '../ui.js';

/** Page navigation with live counts, the connection state and sign-out. A drawer on a phone. */
export function Sidebar({
  open,
  projects,
  projectId,
  workCount,
  messageCount,
  offline,
  onNavigate,
  onLogout,
  onProject,
  footer,
}: {
  open: boolean;
  projects: readonly Project[];
  projectId: string | undefined;
  workCount: number;
  messageCount: number;
  offline: boolean;
  onNavigate: () => void;
  onLogout: () => void;
  onProject: (projectId: string) => void;
  /** Shown above the sign-out row; on a phone this is where the top bar's numbers live. */
  footer?: ReactNode;
}) {
  const t = useT();
  return (
    <nav className={`sidebar ${open ? 'open' : ''}`} aria-label={t('project')}>
      {/* The top bar's project picker has no room on a phone; it lives here instead. */}
      <label className="drawer-project">
        <span className="nav-title">WORKSPACE</span>
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
      </label>
      <div className="nav-title desktop-title">WORKSPACE</div>
      {nav.map(([key, Icon]) => (
        <NavLink
          onClick={onNavigate}
          key={key}
          to={pageLink(key, projectId)}
          className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
        >
          <Icon size={18} />
          <span>{t(key)}</span>
          {key === 'tasks' && workCount ? <small>{workCount}</small> : null}
          {key === 'messages' && messageCount ? <small>{messageCount}</small> : null}
        </NavLink>
      ))}
      {footer}
      <div className="sidebar-bottom">
        <div className={`connection ${offline ? 'disconnected' : ''}`}>
          <span />
          {offline ? t('offline') : t('connected')}
        </div>
        <small>LOCAL-FIRST · v0.4 DEV</small>
        <button className="text-button" onClick={onLogout}>
          <LogOut size={14} />
          {t('logout')}
        </button>
      </div>
    </nav>
  );
}
