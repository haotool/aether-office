import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewComments, Work } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';
import type { Key } from '../i18n.js';

const statusKey: Record<ReviewComments['comments'][number]['status'], Key> = {
  current: 'commentCurrent',
  carried: 'commentCarried',
  stale: 'commentStale',
  unknown: 'commentUnknown',
};

export function HunkComments({
  projectId,
  work,
  canComment,
}: {
  projectId: string;
  work: Work;
  canComment: boolean;
}) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const key = ['review-comments', projectId, work.id, work.headSha];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<ReviewComments>(`/api/projects/${projectId}/work/${work.id}/comments`),
    refetchInterval: 4000,
  });
  const data = query.data;
  return (
    <section aria-label={t('hunkComments')}>
      <h4>{t('hunkComments')}</h4>
      {data?.comments.length === 0 && <p className="muted">{t('commentsEmpty')}</p>}
      <ul className="plain-list">
        {data?.comments.map((c) => (
          <li key={c.id}>
            <code>{c.path}</code>{' '}
            <small>
              @{c.headSha.slice(0, 8)} · {t(statusKey[c.status])}
            </small>
            <p className="preserve-space">{c.body}</p>
          </li>
        ))}
      </ul>
      {canComment &&
        work.state === 'reviewing' &&
        data &&
        (data.hunks.length === 0 ? (
          <p className="muted">{t('commentNeedDiff')}</p>
        ) : (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const element = e.currentTarget; // React clears currentTarget after the first await
              const form = new FormData(element);
              const hunk = data.hunks[Number(form.get('hunk'))]!;
              setError('');
              try {
                await execute(
                  'work.comment',
                  {
                    workId: work.id,
                    headSha: data.head,
                    path: hunk.path,
                    hunkHash: hunk.hash,
                    body: form.get('body'),
                  },
                  projectId,
                );
                element.reset();
                await client.invalidateQueries({ queryKey: key });
              } catch (err) {
                setError(err instanceof Error ? err.message : 'REQUEST_FAILED');
              }
            }}
          >
            <Field label={t('commentHunk')}>
              <select name="hunk">
                {data.hunks.map((h, i) => (
                  <option key={h.hash + i} value={i}>
                    {h.path} {h.header}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('commentBody')}>
              <textarea required name="body" rows={2} maxLength={4000} />
            </Field>
            {error && <p role="alert">{error}</p>}
            <button type="submit">{t('commentAdd')}</button>
          </form>
        ))}
    </section>
  );
}
