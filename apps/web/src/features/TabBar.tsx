import { NavLink } from 'react-router-dom';
import { Building2, Layers, ListTodo, Menu, MessagesSquare } from 'lucide-react';
import { pageLink } from '../nav.js';
import { useT } from '../ui.js';

const TABS = [
  ['office', Building2],
  ['sessions', Layers],
  ['tasks', ListTodo],
  ['messages', MessagesSquare],
] as const;

/** Navigation at the thumb on a portrait phone: four pages, and "more" for the rest (the drawer). */
export function TabBar({
  projectId,
  counts,
  moreOpen,
  onMore,
}: {
  projectId: string | undefined;
  /** Things that need a person, per page; `more` is the approvals waiting in the pages behind it. */
  counts: Partial<Record<(typeof TABS)[number][0] | 'more', number>>;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const t = useT();
  return (
    <nav className="tabbar" aria-label={t('project')}>
      {TABS.map(([key, Icon]) => (
        <NavLink
          key={key}
          to={pageLink(key, projectId)}
          className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
        >
          <span className="tab-icon">
            <Icon size={22} aria-hidden="true" />
          </span>
          <span className="tab-label">{key === 'sessions' ? t('sessionsTab') : t(key)}</span>
          {counts[key] ? <b>{counts[key]}</b> : null}
        </NavLink>
      ))}
      <button className="tab" aria-expanded={moreOpen} onClick={onMore}>
        <span className="tab-icon">
          <Menu size={22} aria-hidden="true" />
        </span>
        <span className="tab-label">{t('more')}</span>
        {counts.more ? <b>{counts.more}</b> : null}
      </button>
    </nav>
  );
}
