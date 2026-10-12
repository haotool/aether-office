import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/api.js';
import { useT } from '../../ui/useT.js';
import { Row, Skeleton, StatusChip } from './kit.js';

const REPO = 'https://github.com/haotool/aether-office';
// The production build carries its own licence and notices (scripts/build.mjs); the dev server does not have them.
const SHIPPED = import.meta.env.DEV ? `${REPO}/blob/main` : '';
const LINKS = [
  ['stLinkRepo', REPO],
  ['stLinkDocs', `${REPO}/blob/main/docs/getting-started.md`],
  ['stLinkSecurity', `${REPO}/blob/main/docs/security.md`],
  [
    'stLinkNotices',
    SHIPPED ? `${SHIPPED}/docs/legal/THIRD_PARTY_NOTICES.md` : '/THIRD_PARTY_NOTICES.txt',
  ],
  ['stLinkLicense', SHIPPED ? `${SHIPPED}/LICENSE` : '/LICENSE.txt'],
] as const;

const SHORTCUTS = [
  ['⌘ / Ctrl + K', 'stKeyQuick'],
  ['/', 'stKeySearch'],
  ['Esc', 'stKeyClose'],
  ['Enter · Shift + Enter', 'stKeySend'],
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
