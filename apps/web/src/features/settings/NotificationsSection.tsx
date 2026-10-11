import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Mode, RemoteApprovalsState } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import {
  notificationsSupported,
  permissionNow,
  requestNotificationPermission,
} from '../../lib/notifications/notifications.js';
import { usePreferences } from '../../lib/preferences/state.js';
import { useT } from '../../ui/useT.js';
import { useSettings } from './context.js';
import { CopyCommand, InlineHelp, Row, StatusChip, Switch } from './kit.js';

const KEY = ['remote-approvals'];
const HOOK_INSTALL = 'pnpm hooks install --remote-approvals';
export const HOOK_STATUS = 'pnpm hooks status';

function NotifyRow() {
  const t = useT();
  const prefs = usePreferences();
  const [permission, setPermission] = useState(permissionNow);
  const secure = window.isSecureContext;
  const status = (
    <>
      <StatusChip tone={prefs.notify ? 'ok' : 'off'}>
        {t(prefs.notify ? 'stOn' : 'stOff')}
      </StatusChip>
      {!notificationsSupported() ? (
        <StatusChip tone="off">{t('notifyUnsupported')}</StatusChip>
      ) : permission === 'granted' ? (
        <StatusChip tone="ok">{t('stPermGranted')}</StatusChip>
      ) : permission === 'denied' ? (
        <StatusChip tone="warn">{t('stPermDenied')}</StatusChip>
      ) : (
        <StatusChip tone="info">{t('stPermAsk')}</StatusChip>
      )}
      {!secure && <StatusChip tone="warn">{t('stNeedsHttps')}</StatusChip>}
    </>
  );
  return (
    <Row
      id="notify"
      status={status}
      control={
        <Switch
          checked={prefs.notify}
          onChange={async (notify) => {
            prefs.set({ notify });
            if (!notify) return;
            await requestNotificationPermission();
            setPermission(permissionNow());
          }}
        />
      }
    >
      {prefs.notify && permission === 'denied' && (
        <InlineHelp summary={t('stPermReenable')}>
          <p>{t('notifyDenied')}</p>
          <p>{t('stPermReenableSteps')}</p>
        </InlineHelp>
      )}
      {prefs.notify && !secure && <p className="muted">{t('stNotifyNeedsHttps')}</p>}
    </Row>
  );
}

function useRemoteApprovals(mode: Mode) {
  const t = useT();
  const client = useQueryClient();
  const { notify } = useSettings();
  const state = useQuery({
    queryKey: KEY,
    queryFn: () => api<RemoteApprovalsState>('/api/remote-approvals'),
    enabled: mode === 'live',
    retry: false,
  });
  const toggle = useMutation({
    mutationFn: (enabled: boolean) =>
      api<RemoteApprovalsState>('/api/remote-approvals', {
        method: 'PUT',
        body: JSON.stringify({ enabled }),
      }),
    onSuccess: (next) => {
      client.setQueryData(KEY, next);
      void client.invalidateQueries({ queryKey: ['permission-requests'] });
    },
  });
  const enabled = state.data?.enabled ?? false;
  const change = (next: boolean) =>
    toggle.mutate(next, {
      onSuccess: () =>
        notify({
          text: `${t('remoteApprovalsToggle')}: ${t(next ? 'stOn' : 'stOff')}`,
          undo: () => toggle.mutate(!next),
        }),
    });
  return { state, toggle, enabled, change };
}

function RemoteRow({ mode, owner }: { mode: Mode; owner: boolean }) {
  const t = useT();
  const { state, toggle, enabled, change } = useRemoteApprovals(mode);
  const channel = state.data?.channel;
  const lock =
    mode !== 'live' ? t('stLiveOnly') : !owner || state.isError ? t('stOwnerOnly') : undefined;
  return (
    <Row
      id="remote"
      lock={lock}
      control={
        <Switch
          checked={enabled}
          disabled={toggle.isPending || state.isPending}
          onChange={change}
        />
      }
      status={
        state.data && (
          <>
            <StatusChip tone={enabled ? 'ok' : 'off'}>{t(enabled ? 'stOn' : 'stOff')}</StatusChip>
            {channel === 'ok' && <StatusChip tone="ok">{t('stChannelOk')}</StatusChip>}
            {channel === 'blocked' && <StatusChip tone="warn">{t('stChannelBlocked')}</StatusChip>}
            {channel === 'lan-opt-in' && <StatusChip tone="warn">{t('stChannelLan')}</StatusChip>}
          </>
        )
      }
    >
      {channel === 'blocked' && (
        <p className="muted" role="alert">
          {t('remoteApprovalsBlocked')}
        </p>
      )}
      {channel === 'lan-opt-in' && <p className="muted">{t('remoteApprovalsLanOn')}</p>}
      <InlineHelp summary={t('stRemoteHow')}>
        <p>{t('remoteApprovalsHint')}</p>
        <p>{t('remoteApprovalsInstall')}</p>
        <CopyCommand command={HOOK_INSTALL} />
        <p>{t('stHookStatusNote')}</p>
        <CopyCommand command={HOOK_STATUS} />
      </InlineHelp>
    </Row>
  );
}

export function NotificationsSection({ mode, owner }: { mode: Mode; owner: boolean }) {
  return (
    <>
      <NotifyRow />
      <RemoteRow mode={mode} owner={owner} />
    </>
  );
}
