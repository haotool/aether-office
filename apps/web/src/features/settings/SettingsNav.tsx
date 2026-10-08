import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import {
  Bell,
  Building2,
  ChevronRight,
  Cpu,
  Info,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Wrench,
} from 'lucide-react';
import { useT } from '../../ui/useT.js';
import { SECTIONS, settingsPath, type SectionId } from './sections.js';

const ICONS = {
  general: SlidersHorizontal,
  notifications: Bell,
  connections: Smartphone,
  models: Cpu,
  office: Building2,
  advanced: Wrench,
  data: ShieldCheck,
  about: Info,
} as const satisfies Record<SectionId, unknown>;

type NavProps = {
  sections: readonly { id: SectionId }[];
  projectId: string;
  /** Called with the section; the page changes the address and scrolls. */
  onGo: (id: SectionId) => void;
};

/**
 * The groups as a column at the left (a row of tabs above the content where the page is too narrow for two columns),
 * with the one in view marked. Real links, so they open in a new tab and work with the keyboard.
 */
export function SideNav({
  sections,
  active,
  projectId,
  onGo,
}: NavProps & { active: SectionId | null }) {
  const t = useT();
  return (
    <nav className="snav" aria-label={t('stNavLabel')}>
      <ul>
        {sections.map(({ id }) => {
          const Icon = ICONS[id];
          const meta = SECTIONS.find((s) => s.id === id);
          if (!meta) throw new Error(`unknown settings section: ${id}`);
          return (
            <SectionItem
              key={id}
              {...{ id, projectId, onGo }}
              current={active === id}
              keepNewTab // the browser's own: a new tab
            >
              <Icon size={16} aria-hidden="true" />
              {t(meta.label)}
            </SectionItem>
          );
        })}
      </ul>
    </nav>
  );
}

/** One group's entry: a real link to its address that the page answers by scrolling instead of navigating. */
function SectionItem({
  id,
  projectId,
  onGo,
  current,
  keepNewTab,
  children,
}: Pick<NavProps, 'projectId' | 'onGo'> & {
  id: SectionId;
  current?: boolean;
  /** Leave Cmd/Ctrl/Shift-clicks to the browser. */
  keepNewTab?: boolean;
  children: ReactNode;
}) {
  return (
    <li>
      <Link
        to={settingsPath(id, projectId)}
        aria-current={current ? 'location' : undefined}
        onClick={(e) => {
          if (keepNewTab && (e.metaKey || e.ctrlKey || e.shiftKey)) return;
          e.preventDefault();
          onGo(id);
        }}
      >
        {children}
      </Link>
    </li>
  );
}

/** A phone's home: the groups as large rows, each opening its own page (a back button returns here). */
export function HomeList({ sections, projectId, onGo }: NavProps) {
  const t = useT();
  return (
    <nav className="shome" aria-label={t('stNavLabel')}>
      <ul>
        {sections.map(({ id }) => {
          const Icon = ICONS[id];
          const meta = SECTIONS.find((s) => s.id === id);
          if (!meta) throw new Error(`unknown settings section: ${id}`);
          return (
            <SectionItem key={id} {...{ id, projectId, onGo }}>
              <Icon size={20} aria-hidden="true" />
              <span>
                <strong>{t(meta.label)}</strong>
                <small>{t(meta.hint)}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </SectionItem>
          );
        })}
      </ul>
    </nav>
  );
}
