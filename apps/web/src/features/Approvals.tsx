import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { execute } from '../api-commands.js';
import type { RemoteApprovalsState } from '@aether/contracts';
import { PageHeading } from '../ui/PageHeading.js';
import { Empty } from '../ui/Empty.js';
import { Badge } from '../ui/Badge.js';
import { useT, useWhy } from '../ui/useT.js';
import { PermissionCard } from './PermissionCard.js';
import { QueryStatus } from './QueryStatus.js';
import { usePermissionRequests } from './permission-requests.js';
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

const stateOf = (a: Approval, expired: boolean) =>
  a.providerAcknowledgedAt
    ? 'acknowledged'
    : expired && a.state === 'pending'
      ? 'expired'
      : a.state;

/** Decides pending approvals one at a time; a failed decision shows its error, and the list is read again either way. */
function useDecide(projectId: string, refetch: () => Promise<unknown>) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
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
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      await refetch();
      setBusy(null);
    }
  }
  return { busy, error, decide };
}

function ApprovalCard({
  a,
  busy,
  onDecide,
}: {
  a: Approval;
  busy: boolean;
  onDecide: (decision: 'approve' | 'deny') => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  const expired = a.expiresAt <= Date.now();
  return (
    <article className="panel approval-card">
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
      <Badge state={stateOf(a, expired)} />
      <p>{new Date(a.expiresAt).toLocaleString()}</p>
      {a.state === 'pending' && !expired && (
        <div className="button-row">
          <button
            disabled={busy}
            {...whyNot([!busy, 'whyBusy'])}
            className="primary"
            onClick={() => onDecide('approve')}
          >
            {t('allowTool')}
          </button>
          <button disabled={busy} {...whyNot([!busy, 'whyBusy'])} onClick={() => onDecide('deny')}>
            {t('denyTool')}
          </button>
        </div>
      )}
    </article>
  );
}

/** The approvals to decide here: the permission prompts waiting on Claude Code sessions, the remote-approvals setting, and the project's own approvals. */
function useApprovalData(projectId: string, live: boolean) {
  // The prompts of Claude Code sessions waiting for an answer (Remote approvals), the same ones the feed and the conversation show.
  const prompts = usePermissionRequests().filter((r) => r.state === 'pending');
  const remote = useQuery({
    queryKey: ['remote-approvals'],
    queryFn: () => api<RemoteApprovalsState>('/api/remote-approvals'),
    enabled: live,
    retry: false,
  });
  const query = useQuery({
    queryKey: ['approvals', projectId],
    queryFn: () => api<Approval[]>(`/api/projects/${projectId}/approvals`),
    refetchInterval: 1000,
  });
  return { prompts, remote, query };
}

export function Approvals({ projectId, live }: { projectId: string; live: boolean }) {
  const t = useT();
  const { prompts, remote, query } = useApprovalData(projectId, live);
  const { busy, error, decide } = useDecide(projectId, query.refetch);
  return (
    <>
      <PageHeading title={t('approvals')} subtitle={t('approvalNote')} />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {prompts.length > 0 && (
        <div className="approval-list">
          {prompts.map((request) => (
            <PermissionCard key={request.id} request={request} />
          ))}
        </div>
      )}
      <QueryStatus query={query} />
      {query.isPending || query.error ? null : query.data?.length ? (
        <div className="approval-list">
          {query.data.map((a) => (
            <ApprovalCard
              key={a.id}
              a={a}
              busy={busy !== null}
              onDecide={(d) => void decide(a, d)}
            />
          ))}
        </div>
      ) : (
        prompts.length === 0 && (
          <Empty
            title={t('noApprovals')}
            hint={t(remote.data?.enabled ? 'approvalEmptyOn' : 'approvalEmptyHint')}
          />
        )
      )}
    </>
  );
}
