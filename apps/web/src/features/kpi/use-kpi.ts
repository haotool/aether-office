import { useQuery } from '@tanstack/react-query';
import type { GitKpiResponse, UsageResponse } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { normalizeGit, normalizeUsage } from './usage-compat.js';
import type { Range } from '../kpi/kpi-model.js';
import { POLL, pollBy } from '../../lib/app/polling.js';

export function useUsage(range: Range, enabled = true) {
  return useQuery({
    queryKey: ['usage', range],
    queryFn: async () => normalizeUsage(await api<UsageResponse>(`/api/usage?range=${range}`)),
    enabled,
    ...pollBy((data: UsageResponse | undefined) =>
      data && !data.scan.complete ? POLL.working : POLL.slow,
    ),
    retry: false,
    staleTime: POLL.working,
  });
}

export function useGitKpi(enabled = true) {
  return useQuery({
    queryKey: ['usage-git'],
    queryFn: async () => normalizeGit(await api<GitKpiResponse>('/api/usage/git')),
    enabled,
    ...pollBy((data: GitKpiResponse | undefined) => (data?.building ? POLL.rare : POLL.idle)),
    retry: false,
    staleTime: POLL.slow,
  });
}
