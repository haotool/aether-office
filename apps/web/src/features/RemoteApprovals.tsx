import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { RemoteApprovalsState } from '@aether/contracts';
import { api } from '../api.js';
import { useT } from '../ui.js';

const KEY = ['remote-approvals'];
const INSTALL = 'pnpm hooks install --remote-approvals';

/** The opt-in switch for answering Claude Code permission prompts from the panel, with what it costs. Owner only. */
export function RemoteApprovals({ canManage }: { canManage: boolean }) {
  const t = useT();
  const client = useQueryClient();
  const state = useQuery({
    queryKey: KEY,
    queryFn: () => api<RemoteApprovalsState>('/api/remote-approvals'),
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api<RemoteApprovalsState>('/api/remote-approvals', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (next) => client.setQueryData(KEY, next),
  });
  if (state.isError) return null; // not for viewers
  const enabled = state.data?.enabled ?? false;
  return (
    <section className="panel remote-approvals">
      <h3>{t('remoteApprovalsTitle')}</h3>
      <label className="toggle-label">
        <span>{t('remoteApprovalsToggle')}</span>
        <input
          type="checkbox"
          checked={enabled}
          disabled={!canManage || toggle.isPending || state.isPending}
          onChange={(e) => toggle.mutate(e.target.checked)}
        />
      </label>
      <p className="muted">{t('remoteApprovalsHint')}</p>
      <p className="muted">
        {t('remoteApprovalsInstall')} <code>{INSTALL}</code>
      </p>
      {state.data?.channel === 'blocked' && (
        <p className="muted" role="alert">
          {t('remoteApprovalsBlocked')}
        </p>
      )}
      {state.data?.channel === 'lan-opt-in' && <p className="muted">{t('remoteApprovalsLanOn')}</p>}
      {!canManage && <p className="muted">{t('remoteApprovalsOwner')}</p>}
    </section>
  );
}
