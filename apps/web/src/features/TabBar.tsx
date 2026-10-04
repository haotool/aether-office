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
  counts: Partial<Record<(typeof TABS)[number][0], number>>;
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
          <Icon size={22} aria-hidden="true" />
          <span>{key === 'sessions' ? t('sessionsTab') : t(key)}</span>
          {counts[key] ? <b>{counts[key]}</b> : null}
        </NavLink>
      ))}
      <button className="tab" aria-expanded={moreOpen} onClick={onMore}>
        <Menu size={22} aria-hidden="true" />
        <span>{t('more')}</span>
      </button>
    </nav>
  );
}
