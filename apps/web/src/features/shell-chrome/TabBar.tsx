import { NavLink } from 'react-router-dom';
import { Menu } from 'lucide-react';
import type { Key } from '../../lib/i18n/i18n.js';
import { nav, pageLink, tabPages } from '../../lib/navigation/nav.js';
import { useT } from '../../ui/useT.js';

const icons = new Map<string, (typeof nav)[number][1]>(nav);

type Counts = Record<'tasks' | 'messages' | 'approvals' | 'sessions', number>;

export function TabBar({
  projectId,
  advanced,
  counts,
  moreOpen,
  onMore,
}: {
  projectId: string | undefined;
  advanced: boolean;
  counts: Counts;
  moreOpen: boolean;
  onMore: () => void;
}) {
  const t = useT();
  const tabs: readonly string[] = tabPages(advanced);
  const more = tabs.includes('approvals') ? 0 : counts.approvals;
  return (
    <nav className="tabbar" aria-label={t('project')}>
      {tabs.map((key) => {
        const Icon = icons.get(key);
        if (!Icon) throw new Error(`tab icon missing: ${key}`);
        const count = counts[key as keyof Counts] ?? 0;
        return (
          <NavLink
            key={key}
            to={pageLink(key, projectId)}
            className={({ isActive }) => `tab ${isActive ? 'active' : ''}`}
          >
            <span className="tab-icon">
              <Icon size={22} aria-hidden="true" />
            </span>
            <span className="tab-label">
              {key === 'sessions' ? t('sessionsTab') : t(key as Key)}
            </span>
            {count ? <b>{count}</b> : null}
          </NavLink>
        );
      })}
      <button className="tab" aria-expanded={moreOpen} onClick={onMore}>
        <span className="tab-icon">
          <Menu size={22} aria-hidden="true" />
        </span>
        <span className="tab-label">{t('more')}</span>
        {more ? <b>{more}</b> : null}
      </button>
    </nav>
  );
}
