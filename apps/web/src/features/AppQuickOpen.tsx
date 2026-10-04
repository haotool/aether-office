import { lazy, Suspense } from 'react';
import type { LocalSessionsResponse, Project } from '@aether/contracts';
import { nav, pageLink } from '../nav.js';
import { useT } from '../ui.js';

const QuickOpen = lazy(() => import('./QuickOpen.js').then((m) => ({ default: m.QuickOpen })));

/** Ctrl/Cmd+K: jump to a page, a project or a local session. Loaded only when first opened. */
export function AppQuickOpen({
  page,
  projectId,
  projects,
  sessions,
  onClose,
}: {
  page: string;
  projectId: string | undefined;
  projects: readonly Project[];
  sessions: LocalSessionsResponse['sessions'];
  onClose: () => void;
}) {
  const t = useT();
  return (
    <Suspense fallback={null}>
      <QuickOpen
        onClose={onClose}
        items={[
          ...nav.map(([key]) => ({
            id: `page:${key}`,
            label: t(key),
            hint: key,
            to: pageLink(key, projectId),
          })),
          ...projects.map((p) => ({
            id: `project:${p.id}`,
            label: p.name,
            hint: t('project'),
            to: `/${page}?project=${p.id}`,
          })),
          ...sessions.map((s) => ({
            id: `session:${s.key}`,
            label: s.title ?? s.repo,
            hint: `${s.provider} · ${s.repo} · ${s.git?.branch ?? ''}`,
            to: `/office?${s.projectId ? `project=${s.projectId}&` : ''}agent=${encodeURIComponent(`local:${s.key}`)}&focus=1`,
          })),
        ]}
      />
    </Suspense>
  );
}
