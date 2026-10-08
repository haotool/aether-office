import { lazy, Suspense } from 'react';
import type { LocalSessionsResponse, Project } from '@aether/contracts';
import { pageLink, visibleNav } from '../../lib/navigation/nav.js';
import { sessionLink } from '../../lib/sessions/session-names.js';
import { useT } from '../../ui/useT.js';

const QuickOpen = lazy(() => import('./QuickOpen.js').then((m) => ({ default: m.QuickOpen })));

/** Ctrl/Cmd+K: jump to a page, a project or a local session. Loaded only when first opened. */
export function AppQuickOpen({
  page,
  advanced,
  projectId,
  projects,
  sessions,
  onClose,
}: {
  page: string;
  advanced: boolean;
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
          ...visibleNav(advanced).map(([key]) => ({
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
            to: sessionLink(s),
          })),
        ]}
      />
    </Suspense>
  );
}
