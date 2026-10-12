import { Link } from 'react-router-dom';
import { usePreferences } from '../../lib/preferences/state.js';
import { pageLink } from '../../lib/navigation/nav.js';
import { useT } from '../../ui/useT.js';
import { A2AClients } from '../integrations/A2AClients.js';
import { Integrations } from '../integrations/Integrations.js';
import { Schedules } from '../operations/Schedules.js';
import { useSettings } from './context.js';
import type { EntryId } from './entries.js';
import { Block, Row, StatusChip, Switch } from './kit.js';

type AdvancedSectionProps = {
  projectId: string;
  owner: boolean;
  canWrite: boolean;
};

export const ADVANCED_ONLY: ReadonlySet<EntryId> = new Set([
  'schedules',
  'a2a',
  'integrations',
  'hosts',
]);

function AdvancedPages({ projectId, owner, canWrite }: AdvancedSectionProps) {
  const t = useT();
  return (
    <>
      <Block id="schedules">
        <Schedules projectId={projectId} canManage={canWrite} />
      </Block>
      <Block id="a2a">
        <A2AClients projectId={projectId} canManage={owner} />
      </Block>
      <Block id="integrations">
        <Integrations projectId={projectId} canManage={owner} />
      </Block>
      <Row id="hosts">
        <nav className="slinks" aria-label={t('stHostsLabel')}>
          <Link className="secondary" to={pageLink('machines', projectId)}>
            {t('machines')}
          </Link>
          <Link className="secondary" to={pageLink('workspace', projectId)}>
            {t('workspace')}
          </Link>
        </nav>
      </Row>
    </>
  );
}

export function AdvancedSection({ projectId, owner, canWrite }: AdvancedSectionProps) {
  const t = useT();
  const prefs = usePreferences();
  const { notify } = useSettings();
  return (
    <>
      <Row
        id="advanced"
        control={
          <Switch
            checked={prefs.advanced}
            onChange={(advanced) => {
              prefs.set({ advanced });
              notify({
                text: `${t('advancedTitle')}: ${t(advanced ? 'stOn' : 'stOff')}`,
                undo: () => prefs.set({ advanced: !advanced }),
              });
            }}
          />
        }
        status={
          <StatusChip tone={prefs.advanced ? 'ok' : 'off'}>
            {t(prefs.advanced ? 'stOn' : 'stOff')}
          </StatusChip>
        }
      />
      {prefs.advanced && <AdvancedPages projectId={projectId} owner={owner} canWrite={canWrite} />}
    </>
  );
}
