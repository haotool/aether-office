import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { PermissionDecisionInput, PermissionRequestView } from '@aether/contracts';
import { ApiError } from '../../lib/api/api-error.js';
import { api } from '../../lib/api/api.js';
import { POLL, pollBy } from '../../lib/app/polling.js';

const KEY = ['permission-requests'];
type Listed = { requests: PermissionRequestView[]; enabled?: boolean };
const NONE: PermissionRequestView[] = [];

/**
 * The permission prompts of Claude Code sessions that wait for an answer from here (Remote approvals). One query
 * shared by the feed, the conversation and the phone sheet; it stops asking for good when this person may not see
 * them (a viewer gets a 403), and costs nothing on the server when Remote approvals is off (the list is empty).
 * Only the caller that passes `enabled` (the signed-in app shell) fetches; every other caller reads the shared cache.
 */
export function usePermissionRequests(enabled = false): PermissionRequestView[] {
  const query = useQuery({
    queryKey: KEY,
    enabled,
    queryFn: () => api<Listed>('/api/permission-requests'),
    select: (listed) => listed.requests,
    // The server says when Remote approvals is off: nothing can be asked then, so only look now and then.
    ...pollBy((listed: Listed | undefined, failed) =>
      failed ? false : listed?.enabled === false ? POLL.slow : POLL.prompt,
    ),
    refetchIntervalInBackground: false,
    retry: false,
  });
  return query.data ?? NONE;
}

/** Pure. The pending requests of one session, oldest first (the order Claude asked in). */
export const requestsFor = (requests: readonly PermissionRequestView[], sessionKey: string) =>
  requests
    .filter((r) => r.state === 'pending' && r.sessionKey === sessionKey)
    .sort((a, b) => a.createdAt - b.createdAt);

/** Pure. The keys of the sessions that have a request waiting. */
export const askingKeys = (requests: readonly PermissionRequestView[]): ReadonlySet<string> =>
  new Set(requests.filter((r) => r.state === 'pending').map((r) => r.sessionKey));

/** Pure. A compact card shows one line, so for a call that line does not fully show it offers Review instead of Allow. */
export const mustReview = (request: PermissionRequestView, compact: boolean, reviewed: boolean) =>
  compact && request.needsReview && !reviewed;

/** Whole seconds left before the hook gives up and Claude asks in the terminal; never negative. */
export const secondsLeft = (expiresAt: number, now: number) =>
  Math.max(0, Math.ceil((expiresAt - now) / 1000));

export function useDecide(id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (input: PermissionDecisionInput) =>
      api(`/api/permission-requests/${id}/decision`, {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSettled: () => client.invalidateQueries({ queryKey: KEY }),
  });
}

/** The code of a failed decision, for the message under the buttons. */
export const decideError = (error: unknown): string =>
  error instanceof ApiError ? error.code : 'REQUEST_FAILED';
