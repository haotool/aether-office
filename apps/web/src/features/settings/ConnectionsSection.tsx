import { useInstallHint } from '../../lib/platform/install-prompt.js';
import { useT } from '../../ui/useT.js';
import { PairPhoneButton } from '../integrations/ConnectPhone.js';
import { CopyCommand, InlineHelp, Row, StatusChip } from './kit.js';

const standalone = () => window.matchMedia('(display-mode: standalone)').matches;

/** Reaching the office from a phone: the QR pairing, installing it as an app, and whether this address is a secure one. */
export function ConnectionsSection({ canWrite }: { canWrite: boolean }) {
  const t = useT();
  const { hint, install } = useInstallHint();
  const secure = window.isSecureContext;
  return (
    <>
      <Row
        id="pairing"
        lock={canWrite ? undefined : t('stOperatorOnly')}
        control={canWrite ? <PairPhoneButton variant="text" /> : undefined}
      />
      <Row
        id="install"
        control={
          hint === 'prompt' ? (
            <button type="button" className="secondary" onClick={install}>
              {t('installAction')}
            </button>
          ) : undefined
        }
        status={
          standalone() ? (
            <StatusChip tone="ok">{t('stInstalled')}</StatusChip>
          ) : hint === 'prompt' ? (
            <StatusChip tone="info">{t('stInstallable')}</StatusChip>
          ) : hint === 'ios' ? (
            <StatusChip tone="info">{t('installIos')}</StatusChip>
          ) : !secure ? (
            <StatusChip tone="warn">{t('stNeedsHttps')}</StatusChip>
          ) : (
            <StatusChip tone="off">{t('stInstallNone')}</StatusChip>
          )
        }
      />
      <Row
        id="address"
        status={
          <StatusChip tone={secure ? 'ok' : 'warn'}>
            {t(secure ? 'stSecure' : 'stInsecure')}
          </StatusChip>
        }
      >
        <CopyCommand command={window.location.origin} />
        <InlineHelp summary={t('stHttpsHelp')}>
          <p>{t('stHttpsHelpBody')}</p>
        </InlineHelp>
      </Row>
    </>
  );
}
