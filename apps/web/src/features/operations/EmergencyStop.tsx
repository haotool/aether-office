import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { OctagonX } from 'lucide-react';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { useT } from '../../ui/useT.js';
type Policy = { liveEnabled: boolean; maxTurns: number; timeoutMs: number; version: number };

/**
 * One step to halt live execution of a project: the same policy change as switching it off in settings (cancels queued
 * runs, asks running ones to stop, stops terminals).
 */
export function EmergencyStop({ projectId }: { projectId: string }) {
  const t = useT();
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['execution', projectId],
    queryFn: () => api<Policy>(`/api/projects/${projectId}/execution`),
  });
  const policy = query.data;
  if (!policy?.liveEnabled) return null;
  const stop = async () => {
    setError('');
    try {
      await execute(
        'project.execution.configure',
        { liveEnabled: false, maxTurns: policy.maxTurns, timeoutMs: policy.timeoutMs },
        projectId,
        policy.version,
      );
      setConfirming(false);
      await client.invalidateQueries({ queryKey: ['execution', projectId] });
      await client.invalidateQueries({ queryKey: ['snapshot', projectId] });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    }
  };
  return confirming ? (
    <span className="emergency-stop" role="group" aria-label={t('emergencyStop')}>
      <button className="danger" onClick={() => void stop()}>
        {t('emergencyConfirm')}
      </button>
      <button onClick={() => setConfirming(false)}>{t('cancel')}</button>
      {error && <span role="alert">{error}</span>}
    </span>
  ) : (
    <button
      className="danger"
      aria-label={t('emergencyStop')}
      title={t('emergencyStop')}
      onClick={() => setConfirming(true)}
    >
      <OctagonX size={15} aria-hidden="true" />{' '}
      <span className="stop-label">{t('emergencyStop')}</span>
    </button>
  );
}
