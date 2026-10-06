import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalSessionsResponse } from '@aether/contracts';
import { api, type Session } from './api.js';
import { useAdoptRepos } from './adoptProjects.js';
import { pollMs } from './features/live-link.js';
import { useLinkLive, useSessionStream } from './features/use-session-stream.js';

const isOperator = (session: Session | null) =>
  !!session && ['owner', 'operator'].includes(session.actor.role);

/**
 * The machine's local sessions for an owner or operator: kept fresh by the change stream, with polling as the net under
 * it (a few seconds while something works, slower otherwise, slower still while the stream is live). An owner's
 * repositories that are not projects yet are adopted.
 */
export function useLocalSessions(session: Session | null) {
  const client = useQueryClient();
  const live = useLinkLive();
  const query = useQuery({
    queryKey: ['local-sessions'],
    queryFn: () => api<LocalSessionsResponse>('/api/local-sessions'),
    enabled: isOperator(session),
    // Looked at more often while something is working, so how hard it works can be told (activity-rate.ts).
    refetchInterval: (q) =>
      pollMs(
        live,
        q.state.data?.sessions.some((s) => s.hook?.activity === 'working') ? 4000 : 10000,
      ),
    retry: false,
  });
  useSessionStream(isOperator(session) && !!query.data?.enabled);
  useAdoptRepos(
    query.data?.sessions,
    session?.actor.role === 'owner' && !!query.data?.enabled,
    () => {
      void client.invalidateQueries({ queryKey: ['projects'] });
      void client.invalidateQueries({ queryKey: ['local-sessions'] });
    },
  );
  return query;
}

/** How many approvals wait for a decision. Shares the approvals page's cache; looked at every few seconds. */
export function usePendingApprovals(session: Session | null, projectId: string | undefined) {
  const approvals = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: () => api<{ state: string }[]>(`/api/projects/${projectId}/approvals`),
    enabled: !!session && !!projectId,
    refetchInterval: 5000,
    retry: false,
  });
  return approvals.data?.filter((a) => a.state === 'pending').length ?? 0;
}
