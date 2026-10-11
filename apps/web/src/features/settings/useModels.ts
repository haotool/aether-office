import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ModelsResponse } from '@aether/contracts';
import { api } from '../../lib/api/api.js';

const KEY = ['models'];
const FIVE_MINUTES = 5 * 60_000;

export function useModels() {
  const client = useQueryClient();
  const query = useQuery({
    queryKey: KEY,
    queryFn: () => api<ModelsResponse>('/api/models'),
    staleTime: FIVE_MINUTES,
    retry: false,
  });
  const refresh = async () => {
    const fresh = await api<ModelsResponse>('/api/models?refresh=1');
    client.setQueryData(KEY, fresh);
  };
  return { catalogs: query.data?.catalogs, error: query.error, loading: query.isLoading, refresh };
}
