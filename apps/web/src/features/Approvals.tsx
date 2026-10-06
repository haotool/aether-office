import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, execute } from '../api.js';
import { PageHeading, Empty, Badge, useT } from '../ui.js';
type Approval = {
  id: string;
  runId: string;
  sessionId: string;
  toolId: string;
  kind: string;
  state: string;
  version: number;
  actionHash: string;
  expiresAt: number;
  parameters: string;
  decision: string | null;
  providerAcknowledgedAt: number | null;
};
export function Approvals({ projectId }: { projectId: string }) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: () => api<Approval[]>(`/api/projects/${projectId}/approvals`),
    refetchInterval: 1000,
  });
  async function decide(a: Approval, decision: 'approve' | 'deny') {
    setBusy(a.id);
    setError('');
    try {
      await execute(
        'approval.decide',
        { approvalId: a.id, actionHash: a.actionHash, decision },
        projectId,
        a.version,
      );
      await query.refetch();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
      await query.refetch();
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <PageHeading title={t('approvals')} subtitle={t('approvalNote')} />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {query.isPending ? (
        <p>{t('loading')}</p>
      ) : query.error ? (
        <p role="alert" className="error-text">
          {query.error.message}
        </p>
      ) : query.data?.length ? (
        <div className="approval-list">
          {query.data.map((a) => {
            const expired = a.expiresAt <= Date.now();
            return (
              <article className="panel approval-card" key={a.id}>
                <h2>{a.kind}</h2>
                <p>{t('approvalBinding')}</p>
                <dl>
                  <dt>Session</dt>
                  <dd>{a.sessionId}</dd>
                  <dt>Tool</dt>
                  <dd>{a.toolId}</dd>
                  <dt>SHA-256</dt>
                  <dd>{a.actionHash}</dd>
                </dl>
                <pre>{JSON.stringify(JSON.parse(a.parameters), null, 2)}</pre>
                <Badge
                  state={
                    a.providerAcknowledgedAt
                      ? 'acknowledged'
                      : expired && a.state === 'pending'
                        ? 'expired'
                        : a.state
                  }
                />
                <p>{new Date(a.expiresAt).toLocaleString()}</p>
                {a.state === 'pending' && !expired && (
                  <div className="button-row">
                    <button
                      disabled={busy !== null}
                      className="primary"
                      onClick={() => void decide(a, 'approve')}
                    >
                      {t('allowTool')}
                    </button>
                    <button disabled={busy !== null} onClick={() => void decide(a, 'deny')}>
                      {t('denyTool')}
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : (
        <Empty title={t('noApprovals')} hint={t('approvalNote')} />
      )}
    </>
  );
}
