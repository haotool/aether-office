import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { usePreferences } from '../state.js';
import { useT } from '../ui.js';
type Diagnosis = {
  reason: string;
  runId: string | null;
  machineOnline: boolean;
  heartbeatAt: number | null;
  lastEventAt: number | null;
  checkedAt: number;
};
const reasons: Record<string, [string, string]> = {
  no_run: ['尚未建立執行', 'No run created'],
  queued: ['等待 runner 領取', 'Waiting for a runner'],
  claimed: ['已領取，等待程序啟動', 'Claimed; awaiting process start'],
  machine_revoked: ['機器授權已撤銷', 'Machine authorization revoked'],
  machine_offline: ['未收到近期機器心跳', 'No recent machine heartbeat'],
  awaiting_permission: ['等待人類工具批准', 'Awaiting human tool approval'],
  approval_expired: ['工具批准已過期，等待程序回報', 'Approval expired; awaiting process report'],
  awaiting_provider_ack: [
    '批准已決定，等待提供者確認',
    'Decision made; awaiting provider acknowledgement',
  ],
  awaiting_peer: ['程序回報正在等待同事', 'Process reports waiting for a peer'],
  no_recent_events: [
    '機器仍有心跳，但至少 60 秒沒有新工作事件',
    'Machine has a heartbeat; no work events for at least 60 seconds',
  ],
  recent_events: ['近期有工作事件，不代表已完成', 'Recent work events; not proof of completion'],
  cancel_requested: ['已要求取消，等待確認', 'Cancellation requested; awaiting acknowledgement'],
  indeterminate: [
    '執行結果不明，需人工查核',
    'Execution outcome unknown; human reconciliation required',
  ],
  submitted: ['已提交，依目前工作狀態進行審查', 'Submitted; follow the current work review state'],
  failed: ['執行失敗', 'Run failed'],
  cancelled: ['執行已取消', 'Run cancelled'],
};
export function TaskDiagnostics({
  projectId,
  workId,
  version,
}: {
  projectId: string;
  workId: string;
  version: number;
}) {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const query = useQuery({
    queryKey: ['diagnostics', projectId, workId, version],
    queryFn: () => api<Diagnosis>(`/api/projects/${projectId}/work/${workId}/diagnostics`),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchInterval: 5000,
  });
  const format = (value: number | null) =>
    value === null ? t('unavailable') : new Date(value).toLocaleString();
  const d = query.data;
  return (
    <section aria-label={t('workDiagnosis')}>
      {query.error ? (
        <p role="alert">{query.error.message}</p>
      ) : d ? (
        <>
          <p>{reasons[d.reason]?.[locale === 'en' ? 1 : 0] ?? d.reason}</p>
          <dl>
            <dt>{t('runnerHeartbeat')}</dt>
            <dd>{format(d.heartbeatAt)}</dd>
            <dt>{t('lastWorkEvent')}</dt>
            <dd>{format(d.lastEventAt)}</dd>
          </dl>
          <p className="muted">{t('diagnosisNote')}</p>
        </>
      ) : (
        <p>{t('loading')}</p>
      )}
    </section>
  );
}
