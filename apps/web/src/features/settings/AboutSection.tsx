import { useQuery } from '@tanstack/react-query';
import { api } from '../../api.js';
import { useT } from '../../ui.js';
import { Row, Skeleton, StatusChip } from './kit.js';

const REPO = 'https://github.com/haotool/aether-office';
const LINKS = [
  ['stLinkRepo', REPO],
  ['stLinkDocs', `${REPO}/blob/main/docs/getting-started.md`],
  ['stLinkSecurity', `${REPO}/blob/main/docs/security.md`],
  ['stLinkNotices', `${REPO}/blob/main/THIRD_PARTY_NOTICES.md`],
  ['stLinkLicense', `${REPO}/blob/main/LICENSE`],
] as const;

/** The shortcuts the app really has: each is bound in the code named beside it. */
const SHORTCUTS = [
  ['⌘ / Ctrl + K', 'stKeyQuick'], // useQuickOpen
  ['/', 'stKeySearch'], // SettingsPage
  ['Esc', 'stKeyClose'], // Modal, Sheet
  ['Enter · Shift + Enter', 'stKeySend'], // Composer
] as const;

type Health = { status: string; mode: string; version: string };

export function AboutSection() {
  const t = useT();
  const health = useQuery({
    queryKey: ['health'],
    queryFn: () => api<Health>('/health'),
    retry: false,
  });
  return (
    <>
      <Row
        id="version"
        status={
          health.data && (
            <>
              <StatusChip tone="info">v{health.data.version}</StatusChip>
              <StatusChip tone="info">{health.data.mode.toUpperCase()}</StatusChip>
            </>
          )
        }
      >
        {health.isPending && <Skeleton />}
      </Row>
      <Row id="shortcuts">
        <dl className="skeys">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={label}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{t(label)}</dd>
            </div>
          ))}
        </dl>
      </Row>
      <Row id="links">
        <ul className="slinklist">
          {LINKS.map(([label, href]) => (
            <li key={label}>
              <a href={href} target="_blank" rel="noopener noreferrer">
                {t(label)}
              </a>
            </li>
          ))}
        </ul>
      </Row>
    </>
  );
}
