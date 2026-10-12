import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import type { Project } from '@aether/contracts';
import { nav, pageLink, visibleGroups } from '../../lib/navigation/nav.js';

const icons = new Map<string, (typeof nav)[number][1]>(nav);
import { useT } from '../../ui/useT.js';
import { ProjectSelect } from '../integrations/ProjectSelect.js';

function NavGroups({
  advanced,
  projectId,
  counts,
  onNavigate,
}: {
  advanced: boolean;
  projectId: string | undefined;
  counts: Partial<Record<string, number>>;
  onNavigate: () => void;
}) {
  const t = useT();
  return visibleGroups(advanced).map(([group, pages]) => (
    <div className="nav-group" key={group}>
      <div className="nav-group-title">{t(group)}</div>
      {pages.map((key) => {
        const Icon = icons.get(key);
        if (!Icon) throw new Error(`sidebar icon missing: ${key}`);
        return (
          <NavLink
            onClick={onNavigate}
            key={key}
            to={pageLink(key, projectId)}
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
          >
            <Icon size={18} />
            <span>{t(key)}</span>
            {counts[key] ? <small>{counts[key]}</small> : null}
          </NavLink>
        );
      })}
    </div>
  ));
}

function SidebarBottom({ offline, onLogout }: { offline: boolean; onLogout: () => void }) {
  const t = useT();
  return (
    <div className="sidebar-bottom">
      <div className={`connection ${offline ? 'disconnected' : ''}`}>
        <span />
        {offline ? t('offline') : t('connected')}
      </div>
      <small>LOCAL-FIRST · v0.4</small>
      <button className="text-button" onClick={onLogout}>
        <LogOut size={14} />
        {t('logout')}
      </button>
    </div>
  );
}

type SidebarProps = {
  open: boolean;
  projects: readonly Project[];
  projectId: string | undefined;
  advanced: boolean;
  workCount: number;
  approvalCount: number;
  sessionCount: number;
  messageCount: number;
  offline: boolean;
  onNavigate: () => void;
  onLogout: () => void;
  onProject: (projectId: string) => void;
  footer?: ReactNode;
};

export function Sidebar({
  open,
  projects,
  projectId,
  advanced,
  workCount,
  approvalCount,
  sessionCount,
  messageCount,
  offline,
  onNavigate,
  onLogout,
  onProject,
  footer,
}: SidebarProps) {
  const t = useT();
  return (
    <nav className={`sidebar ${open ? 'open' : ''}`} aria-label={t('navigation')}>
      {projects.length > 0 && (
        <label className="drawer-project">
          <span className="nav-title">{t('project')}</span>
          <ProjectSelect projects={projects} projectId={projectId} onProject={onProject} />
        </label>
      )}
      <div className="nav-title desktop-title">{t('project')}</div>
      <NavGroups
        advanced={advanced}
        projectId={projectId}
        counts={{
          tasks: workCount,
          messages: messageCount,
          approvals: approvalCount,
          sessions: sessionCount,
        }}
        onNavigate={onNavigate}
      />
      {footer}
      <SidebarBottom offline={offline} onLogout={onLogout} />
    </nav>
  );
}
