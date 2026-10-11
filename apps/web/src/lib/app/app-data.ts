import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalSessionsResponse } from '@aether/contracts';
import { api } from '../api/api.js';
import { type Session } from '../api/api-session.js';
import { isOperator } from '../navigation/roles.js';
import { useAdoptRepos } from '../../features/integrations/adoptProjects.js';
import { normalizeSessions } from '../sessions/local-session-compat.js';
import type { PendingApproval } from '../notifications/notifications.js';
import { useLinkLive, useSessionStream } from '../../hooks/use-session-stream.js';
import { POLL, poll, pollBy, pollMs } from './polling.js';

/**
 * Polling is the net under the change stream: a few seconds while something works, slower otherwise, slower still while
 * the stream is live.
 */
export function useLocalSessions(session: Session | null) {
  const client = useQueryClient();
  const live = useLinkLive();
  const query = useQuery({
    queryKey: ['local-sessions'],
    queryFn: () => api<LocalSessionsResponse>('/api/local-sessions').then(normalizeSessions),
    enabled: isOperator(session?.actor.role),
    ...pollBy((data: LocalSessionsResponse | undefined) =>
      pollMs(
        live,
        data?.sessions.some((s) => s.hook?.activity === 'working') ? POLL.working : POLL.idle,
      ),
    ),
    retry: false,
  });
  useSessionStream(isOperator(session?.actor.role) && !!query.data?.enabled);
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

export function useApprovals(
  session: Session | null,
  projectId: string | undefined,
  offline: boolean,
) {
  const approvals = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: () => api<PendingApproval[]>(`/api/projects/${projectId}/approvals`),
    enabled: !!session && !!projectId,
    ...poll(offline ? POLL.list : POLL.slow),
    retry: false,
  }).data;
  return { approvals, pending: approvals?.filter((a) => a.state === 'pending').length ?? 0 };
}
