import type { GitGraphCommit } from '@aether/contracts';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/api.js';
import { POLL, poll } from '../../lib/app/polling.js';

export function useGitGraph(projectId: string, enabled = true) {
  return useQuery({
    queryKey: ['git-graph', projectId],
    queryFn: () =>
      api<{ commits: GitGraphCommit[]; lanes: number }>(`/api/projects/${projectId}/git-graph`),
    ...poll(POLL.slow),
    retry: false,
    enabled,
  });
}
