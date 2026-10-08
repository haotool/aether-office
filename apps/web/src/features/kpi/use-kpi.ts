import { useQuery } from '@tanstack/react-query';
import type { GitKpiResponse, UsageResponse } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { normalizeGit, normalizeUsage } from './usage-compat.js';
import type { Range } from '../kpi/kpi-model.js';
import { POLL, pollBy } from '../../lib/app/polling.js';

/** Token usage over a range (cached by the server and revalidated by ETag). Errors (an older server, a viewer) leave no data. */
export function useUsage(range: Range, enabled = true) {
  return useQuery({
    queryKey: ['usage', range],
    queryFn: async () => normalizeUsage(await api<UsageResponse>(`/api/usage?range=${range}`)),
    enabled,
    // While the first scan of a long history is still reading, ask again soon: the numbers are a lower bound until then.
    ...pollBy((data: UsageResponse | undefined) =>
      data && !data.scan.complete ? POLL.working : POLL.slow,
    ),
    retry: false,
    staleTime: POLL.working,
  });
}

/** Commits, merges and branches per project, office and for the building. */
export function useGitKpi(enabled = true) {
  return useQuery({
    queryKey: ['usage-git'],
    queryFn: async () => normalizeGit(await api<GitKpiResponse>('/api/usage/git')),
    enabled,
    // Until a repository is known (projects are adopted from the sessions a moment after the page opens) ask again soon.
    ...pollBy((data: GitKpiResponse | undefined) => (data?.building ? POLL.rare : POLL.idle)),
    retry: false,
    staleTime: POLL.slow,
  });
}
