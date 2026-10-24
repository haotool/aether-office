import { useQuery } from '@tanstack/react-query';
import type { PermissionRequestView } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { POLL, pollBy } from '../../lib/app/polling.js';

export const REQUESTS_KEY = ['permission-requests'];
type Listed = { requests: PermissionRequestView[]; enabled?: boolean };
const NONE: PermissionRequestView[] = [];

/**
 * Stops asking for good when this person may not see the prompts (a viewer gets a 403); only the caller that passes
 * `enabled` (the signed-in app shell) fetches, every other caller reads the shared cache.
 */
export function usePermissionRequests(enabled = false): PermissionRequestView[] {
  const query = useQuery({
    queryKey: REQUESTS_KEY,
    enabled,
    queryFn: () => api<Listed>('/api/permission-requests'),
    select: (listed) => listed.requests,
    ...pollBy((listed: Listed | undefined, failed) =>
      failed ? false : listed?.enabled === false ? POLL.slow : POLL.prompt,
    ),
    refetchIntervalInBackground: false,
    retry: false,
  });
  return query.data ?? NONE;
}

export const requestsFor = (requests: readonly PermissionRequestView[], sessionKey: string) =>
  requests
    .filter((r) => r.state === 'pending' && r.sessionKey === sessionKey)
    .sort((a, b) => a.createdAt - b.createdAt);

export const askingKeys = (requests: readonly PermissionRequestView[]): ReadonlySet<string> =>
  new Set(requests.filter((r) => r.state === 'pending').map((r) => r.sessionKey));

/** Pure. A compact card shows one line, so for a call that line does not fully show it offers Review instead of Allow. */
export const mustReview = (request: PermissionRequestView, compact: boolean, reviewed: boolean) =>
  compact && request.needsReview && !reviewed;

export const secondsLeft = (expiresAt: number, now: number) =>
  Math.max(0, Math.ceil((expiresAt - now) / 1000));
