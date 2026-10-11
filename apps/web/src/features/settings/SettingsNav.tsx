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
  projectId: string;
  onGo: (id: SectionId) => void;
};

export function SideNav({ active, projectId, onGo }: NavProps & { active: SectionId | null }) {
  const t = useT();
  return (
    <nav className="snav" aria-label={t('stNavLabel')}>
      <ul>
        {SECTIONS.map(({ id, label }) => {
          const Icon = ICONS[id];
          return (
            <SectionItem key={id} {...{ id, projectId, onGo }} current={active === id} keepNewTab>
              <Icon size={16} aria-hidden="true" />
              {t(label)}
            </SectionItem>
          );
        })}
      </ul>
    </nav>
  );
}

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

export function HomeList({ projectId, onGo }: NavProps) {
  const t = useT();
  return (
    <nav className="shome" aria-label={t('stNavLabel')}>
      <ul>
        {SECTIONS.map(({ id, label, hint }) => {
          const Icon = ICONS[id];
          return (
            <SectionItem key={id} {...{ id, projectId, onGo }}>
              <Icon size={20} aria-hidden="true" />
              <span>
                <strong>{t(label)}</strong>
                <small>{t(hint)}</small>
              </span>
              <ChevronRight size={18} aria-hidden="true" />
            </SectionItem>
          );
        })}
      </ul>
    </nav>
  );
}
