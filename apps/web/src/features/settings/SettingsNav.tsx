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
import { useT } from '../../ui.js';
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
          const meta = SECTIONS.find((s) => s.id === id)!;
          return (
            <li key={id}>
              <Link
                to={settingsPath(id, projectId)}
                aria-current={active === id ? 'location' : undefined}
                onClick={(e) => {
                  if (e.metaKey || e.ctrlKey || e.shiftKey) return; // the browser's own: a new tab
                  e.preventDefault();
                  onGo(id);
                }}
              >
                <Icon size={16} aria-hidden="true" />
                {t(meta.label)}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
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
          const meta = SECTIONS.find((s) => s.id === id)!;
          return (
            <li key={id}>
              <Link
                to={settingsPath(id, projectId)}
                onClick={(e) => {
                  e.preventDefault();
                  onGo(id);
                }}
              >
                <Icon size={20} aria-hidden="true" />
                <span>
                  <strong>{t(meta.label)}</strong>
                  <small>{t(meta.hint)}</small>
                </span>
                <ChevronRight size={18} aria-hidden="true" />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
