import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';
import { PageHeading } from '../ui/PageHeading.js';
import { useT, useWhy } from '../ui/useT.js';
import type { Key } from '../i18n.js';
type ObservationPage = {
  sources: {
    id: string;
    label: string;
    agentName: string;
    provider: string;
    state: string;
    lastSeen: number;
    lastActivity: number | null;
  }[];
  records: {
    seq: number;
    label: string;
    provider: string;
    sessionId: string;
    role: string;
    kind: string;
    text: string;
    createdAt: number;
  }[];
  nextCursor: number | null;
};
const statuses: Record<string, Key> = {
  observed: 'obObserved',
  unchanged: 'obUnchanged',
  partial: 'obPartial',
  missing: 'obMissing',
  blocked_path: 'obBlocked',
  unsupported_schema: 'obUnsupported',
  limit_exceeded: 'obLimit',
  read_error: 'obError',
  stale: 'obStale',
  offline: 'obOffline',
};
type Source = ObservationPage['sources'][number];
type ObservationRecord = ObservationPage['records'][number];

function SourceCard({ source }: { source: Source }) {
  const t = useT();
  return (
    <article className="panel">
      <h2>{source.agentName}</h2>
      <p>
        {source.provider} · {source.label}
      </p>
      <strong>{t(statuses[source.state] ?? 'obError')}</strong>
      <dl>
        <dt>{t('obLastRead')}</dt>
        <dd>{new Date(source.lastSeen).toLocaleString()}</dd>
        <dt>{t('obLastNew')}</dt>
        <dd>
          {source.lastActivity === null
            ? t('unavailable')
            : new Date(source.lastActivity).toLocaleString()}
        </dd>
      </dl>
    </article>
  );
}

function RecordCard({ record }: { record: ObservationRecord }) {
  const t = useT();
  return (
    <article className="panel">
      <p className="muted">
        {record.provider} · {record.label} · {record.role} · {record.kind} ·{' '}
        {new Date(record.createdAt).toLocaleString()}
      </p>
      <p className="preserve-space observation-text">{record.text}</p>
      <small>
        {t('obSession')}: {record.sessionId}
      </small>
    </article>
  );
}

/** Back to the newest page, or on to the next older one. */
function PageButtons({
  before,
  next,
  onBefore,
}: {
  before: number | undefined;
  next: number | null;
  onBefore: (cursor: number | undefined) => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <div className="form-actions">
      <button
        disabled={before === undefined}
        {...whyNot([before !== undefined, 'whyAtNewest'])}
        onClick={() => onBefore(undefined)}
      >
        {t('obLatest')}
      </button>
      <button
        disabled={!next}
        {...whyNot([!!next, 'whyNoOlder'])}
        onClick={() => next && onBefore(next)}
      >
        {t('obOlder')}
      </button>
    </div>
  );
}

export function Observations({ projectId }: { projectId: string }) {
  const t = useT();
  const [before, setBefore] = useState<number | undefined>();
  const query = useQuery({
    queryKey: ['observations', projectId, before],
    queryFn: () =>
      api<ObservationPage>(
        `/api/projects/${projectId}/observations${before === undefined ? '' : `?before=${before}`}`,
      ),
    staleTime: 0,
    refetchInterval: 2000,
  });
  return (
    <>
      <PageHeading title={t('observations')} subtitle={t('obNote')} />
      <p className="eyebrow">OBSERVE · {t('terminalReadOnly')}</p>
      {query.error && <p role="alert">{query.error.message}</p>}
      {!query.data?.sources.length ? (
        <p>{t('obEmpty')}</p>
      ) : (
        <div className="machine-grid">
          {query.data.sources.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      )}
      <h2>{t('obHistory')}</h2>
      {query.data?.records.map((record) => (
        <RecordCard key={record.seq} record={record} />
      ))}
      <PageButtons before={before} next={query.data?.nextCursor ?? null} onBefore={setBefore} />
    </>
  );
}
