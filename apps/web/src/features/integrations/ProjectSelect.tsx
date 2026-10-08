import type { Project } from '@aether/contracts';
import { useT } from '../../ui/useT.js';

/** The project picker, shared by the top bar and the phone drawer. */
export function ProjectSelect({
  projects,
  projectId,
  onProject,
  title,
}: {
  projects: readonly Project[];
  projectId: string | undefined;
  onProject: (projectId: string) => void;
  title?: string | undefined;
}) {
  const t = useT();
  return (
    <select
      aria-label={t('project')}
      title={title}
      value={projectId ?? ''}
      onChange={(e) => onProject(e.target.value)}
    >
      {projects.map((p) => (
        <option key={p.id} value={p.id}>
          {p.name}
        </option>
      ))}
    </select>
  );
}
