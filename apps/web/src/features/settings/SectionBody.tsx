import type { Mode } from '@aether/contracts';
import { useT } from '../../ui.js';
import { AboutSection } from './AboutSection.js';
import { AdvancedSection } from './AdvancedSection.js';
import { ConnectionsSection } from './ConnectionsSection.js';
import { DataSection } from './DataSection.js';
import { GeneralSection } from './GeneralSection.js';
import { ModelsSection } from './ModelsSection.js';
import { NotificationsSection } from './NotificationsSection.js';
import { OfficeSection } from './OfficeSection.js';
import { SECTIONS, type SectionId } from './sections.js';

export type SettingsScope = { projectId: string; mode: Mode; owner: boolean; canWrite: boolean };

function Body({ id, scope }: { id: SectionId; scope: SettingsScope }) {
  switch (id) {
    case 'general':
      return <GeneralSection />;
    case 'notifications':
      return <NotificationsSection mode={scope.mode} owner={scope.owner} />;
    case 'connections':
      return <ConnectionsSection canWrite={scope.canWrite} />;
    case 'models':
      return <ModelsSection projectId={scope.projectId} mode={scope.mode} owner={scope.owner} />;
    case 'office':
      return <OfficeSection />;
    case 'advanced':
      return (
        <AdvancedSection
          projectId={scope.projectId}
          owner={scope.owner}
          canWrite={scope.canWrite}
        />
      );
    case 'data':
      return <DataSection />;
    case 'about':
      return <AboutSection />;
  }
}

/** One group of settings: its name and what it holds, then its rows. The body is the container the rows lay out against. */
export function Section({
  id,
  scope,
  heading = true,
}: {
  id: SectionId;
  scope: SettingsScope;
  /** False where the page already shows the name (a phone's detail view, whose bar carries it). */
  heading?: boolean;
}) {
  const t = useT();
  const meta = SECTIONS.find((section) => section.id === id)!;
  return (
    <section className="ssection" id={`s-${id}`} aria-labelledby={`h-${id}`}>
      <header className={heading ? undefined : 'visually-hidden'}>
        <h2 id={`h-${id}`}>{t(meta.label)}</h2>
        <p>{t(meta.hint)}</p>
      </header>
      <div className="ssection-body">
        <Body id={id} scope={scope} />
      </div>
    </section>
  );
}
