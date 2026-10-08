import { useQuery } from '@tanstack/react-query';
import type { GitKpiResponse, UsageResponse } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { normalizeGit, normalizeUsage } from './usage-compat.js';
import type { Range } from '../kpi/kpi-model.js';

const SETTLED_MS = 30_000;
/** While the first scan of a long history is still reading, ask again soon: the numbers are a lower bound until then. */
const SCANNING_MS = 4_000;

/** Token usage over a range (cached by the server and revalidated by ETag). Errors (an older server, a viewer) leave no data. */
export function useUsage(range: Range, enabled = true) {
  return useQuery({
    queryKey: ['usage', range],
    queryFn: async () => normalizeUsage(await api<UsageResponse>(`/api/usage?range=${range}`)),
    enabled,
    refetchInterval: (query) =>
      query.state.data && !query.state.data.scan.complete ? SCANNING_MS : SETTLED_MS,
    retry: false,
    staleTime: SCANNING_MS,
  });
}

/** Commits, merges and branches per project, office and for the building. */
export function useGitKpi(enabled = true) {
  return useQuery({
    queryKey: ['usage-git'],
    queryFn: async () => normalizeGit(await api<GitKpiResponse>('/api/usage/git')),
    enabled,
    // Until a repository is known (projects are adopted from the sessions a moment after the page opens) ask again soon.
    refetchInterval: (query) => (query.state.data?.building ? 60_000 : SCANNING_MS * 2),
    retry: false,
    staleTime: SETTLED_MS,
  });
}
