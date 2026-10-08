import { useQuery } from '@tanstack/react-query';
import type { LocalSessionsResponse, Mode, ModelCatalog } from '@aether/contracts';
import { useT } from '../../ui/useT.js';
import { ExecutionSettings } from '../ExecutionSettings.js';
import { ModelPicker, SOURCE_NOTE } from '../ModelPicker.js';
import { useModels } from '../useModels.js';
import { Block, CopyCommand, ErrorLine, Row, Skeleton, StatusChip } from './kit.js';
import { HOOK_STATUS } from './NotificationsSection.js';

const providerName = (catalog: ModelCatalog) =>
  catalog.provider === 'claude' ? 'Claude' : 'Codex';

/** What each CLI on this machine offers, and whether it was found at all: a built-in list means the CLI was not read. */
function ModelList() {
  const t = useT();
  const { catalogs, error, loading, refresh } = useModels();
  return (
    <>
      {catalogs && (
        <div className="srow-status">
          {catalogs.map((catalog) => (
            <StatusChip key={catalog.provider} tone={catalog.source === 'fallback' ? 'warn' : 'ok'}>
              {providerName(catalog)} · {t(SOURCE_NOTE[catalog.source])}
            </StatusChip>
          ))}
        </div>
      )}
      {error && <ErrorLine message={error.message} onRetry={() => void refresh()} />}
      {loading && <Skeleton />}
      {catalogs && <ModelPicker catalogs={catalogs} onRefresh={refresh} />}
    </>
  );
}

/** Whether this machine's Claude Code and Codex sessions are being read, read from what the page already loaded. */
function LocalSessionsRow() {
  const t = useT();
  const local = useQuery<LocalSessionsResponse>({
    queryKey: ['local-sessions'],
    queryFn: () => Promise.reject(new Error('read by the app shell')),
    enabled: false,
  }).data;
  return (
    <Row
      id="local"
      status={
        !local ? (
          <StatusChip tone="off">{t('stLocalUnknown')}</StatusChip>
        ) : local.enabled ? (
          <StatusChip tone="ok">
            {t('stOn')} · {local.sessions.length} {t('stSessionsFound')}
          </StatusChip>
        ) : (
          <StatusChip tone="warn">{t('stLocalOff')}</StatusChip>
        )
      }
    >
      {local && !local.enabled && <p className="muted">{t('stLocalOffHow')}</p>}
    </Row>
  );
}

export function ModelsSection({
  projectId,
  mode,
  owner,
}: {
  projectId: string;
  mode: Mode;
  owner: boolean;
}) {
  const t = useT();
  const live = mode === 'live';
  return (
    <>
      <Row id="models" lock={live ? undefined : t('stLiveOnly')}>
        {live && <ModelList />}
      </Row>
      <LocalSessionsRow />
      {live ? (
        <Block id="execution">
          <ExecutionSettings projectId={projectId} canConfigure={owner} />
        </Block>
      ) : (
        <Row id="execution" lock={t('stLiveOnly')} />
      )}
      <Row id="cli">
        <CopyCommand caption={t('stCliDoctor')} command="pnpm run doctor" />
        <CopyCommand
          caption={t('stCliStatus')}
          command={`${HOOK_STATUS} --project /path/to/repo`}
        />
        <CopyCommand
          caption={t('stCliInstall')}
          command="pnpm hooks install --project /path/to/repo"
        />
      </Row>
    </>
  );
}
