import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, BookOpen } from 'lucide-react';
import type { Work } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Modal, Field, Fold, PageHeading, Empty, Badge, useT } from '../ui.js';
type Entry = {
  id: string;
  title: string;
  body: string;
  source: string;
  classification: string;
  version: number;
  author: string;
  authorName: string | null;
  reviewerName: string | null;
  reviewReason: string | null;
  createdAt: number;
  updatedAt: number;
  workId: string | null;
  artifactId: string | null;
  commitSha: string | null;
};
export function Knowledge({
  projectId,
  canWrite,
  canApprove,
  workItems,
}: {
  projectId: string;
  canWrite: boolean;
  canApprove: boolean;
  workItems: Work[];
}) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const entries = useQuery({
    queryKey: ['knowledge', projectId, search],
    queryFn: () =>
      api<Entry[]>(`/api/projects/${projectId}/knowledge?q=${encodeURIComponent(search)}`),
  });
  return (
    <>
      <PageHeading
        title={t('knowledgeTitle')}
        subtitle={t('knowledgeTrustNote')}
        action={
          <button
            className="primary"
            onClick={() => {
              setError('');
              setAdding(true);
            }}
            disabled={!canWrite}
          >
            <Plus size={16} />
            {t('proposeKnowledge')}
          </button>
        }
      />
      <div className="search-box">
        <BookOpen size={16} />
        <input
          aria-label={t('search')}
          placeholder={t('search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      {entries.isPending ? (
        <p>{t('loading')}</p>
      ) : entries.error ? (
        <p role="alert" className="error-text">
          {entries.error.message}
        </p>
      ) : entries.data?.length ? (
        <div className="knowledge-grid">
          {entries.data.map((entry) => (
            <article className="panel" key={entry.id}>
              <Badge state={entry.classification} />
              <h2>{entry.title}</h2>
              <p className="preserve-space observation-text">{entry.body}</p>
              <footer className="muted">
                {t('source')}: {entry.source} · v{entry.version}
                <br />
                {t('knowledgeAuthor')}: {entry.authorName ?? entry.author}
                <br />
                {t('knowledgeUpdated')}: {new Date(entry.updatedAt).toLocaleString()}
              </footer>
              {(entry.workId || entry.artifactId || entry.commitSha) && (
                <details>
                  <summary>{t('knowledgeReferences')}</summary>
                  {entry.workId && (
                    <p>
                      {t('currentWork')}: <code>{entry.workId}</code>
                    </p>
                  )}
                  {entry.artifactId && (
                    <p>
                      {t('artifactReference')}: <code>{entry.artifactId}</code>
                    </p>
                  )}
                  {entry.commitSha && (
                    <p>
                      {t('commitReference')}: <code>{entry.commitSha}</code>
                    </p>
                  )}
                </details>
              )}
              {entry.reviewReason && (
                <p className="preserve-space">
                  {entry.reviewerName}: {entry.reviewReason}
                </p>
              )}
              {canApprove && entry.classification === 'proposed' && (
                <Fold title={t('knowledgeReviewReason')}>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute(
                        'value',
                      );
                      if (!decision) return;
                      const reason = new FormData(e.currentTarget).get('reason');
                      setBusy(true);
                      setError('');
                      try {
                        await execute(
                          'knowledge.approve',
                          { knowledgeId: entry.id, decision, reason },
                          projectId,
                          entry.version,
                        );
                        await entries.refetch();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Field label={t('knowledgeReviewReason')}>
                      <textarea name="reason" required maxLength={2000} />
                    </Field>
                    <div className="form-actions">
                      <button value="reject" className="secondary" disabled={busy}>
                        {t('knowledgeReject')}
                      </button>
                      <button value="approve" className="primary" disabled={busy}>
                        {t('knowledgeApprove')}
                      </button>
                    </div>
                  </form>
                </Fold>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty title={t('empty')} />
      )}
      {!adding && error && <p role="alert">{error}</p>}
      {adding && (
        <Modal title={t('proposeKnowledge')} onClose={() => setAdding(false)}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setBusy(true);
              setError('');
              const references = Object.fromEntries(
                ['workId', 'artifactId', 'commitSha'].flatMap((key) =>
                  data.get(key) ? [[key, data.get(key)]] : [],
                ),
              );
              try {
                await execute(
                  'knowledge.propose',
                  {
                    title: data.get('title'),
                    body: data.get('body'),
                    source: data.get('source'),
                    ...references,
                  },
                  projectId,
                );
                await entries.refetch();
                setAdding(false);
              } catch (e) {
                setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
              } finally {
                setBusy(false);
              }
            }}
          >
            <Field label={t('name')}>
              <input name="title" autoFocus required maxLength={160} />
            </Field>
            <Field label={t('body')}>
              <textarea name="body" required rows={6} maxLength={32000} />
            </Field>
            <Field label={t('source')}>
              <input name="source" required maxLength={2048} />
            </Field>
            <details>
              <summary>{t('knowledgeReferences')}</summary>
              <Field label={t('currentWork')}>
                <select name="workId">
                  <option value="">—</option>
                  {workItems.map((work) => (
                    <option key={work.id} value={work.id}>
                      {work.title}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t('artifactReference')}>
                <input name="artifactId" pattern="[0-9a-fA-F-]{36}" />
              </Field>
              <Field label={t('commitReference')}>
                <input name="commitSha" pattern="[a-f0-9]{40}([a-f0-9]{24})?" maxLength={64} />
              </Field>
            </details>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button className="primary full-width" disabled={busy}>
              {t('save')}
            </button>
          </form>
        </Modal>
      )}
    </>
  );
}
