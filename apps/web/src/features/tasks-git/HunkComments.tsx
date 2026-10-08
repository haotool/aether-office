import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewComments, Work } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { Field } from '../../ui/Field.js';
import { useT } from '../../ui/useT.js';
import type { Key } from '../../lib/i18n/i18n.js';

const statusKey: Record<ReviewComments['comments'][number]['status'], Key> = {
  current: 'commentCurrent',
  carried: 'commentCarried',
  stale: 'commentStale',
  unknown: 'commentUnknown',
};

type Comments = ReviewComments['comments'];

function CommentList({ comments }: { comments: Comments }) {
  const t = useT();
  return (
    <>
      {comments.length === 0 && <p className="muted">{t('commentsEmpty')}</p>}
      <ul className="plain-list">
        {comments.map((c) => (
          <li key={c.id}>
            <code>{c.path}</code>{' '}
            <small>
              @{c.headSha.slice(0, 8)} · {t(statusKey[c.status])}
            </small>
            <p className="preserve-space">{c.body}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

type CommentFormProps = {
  projectId: string;
  work: Work;
  data: ReviewComments;
  queryKey: readonly unknown[];
};

/** A comment on one hunk of the diff the work is reviewed at. */
function CommentForm({ projectId, work, data, queryKey }: CommentFormProps) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  return (
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
          await client.invalidateQueries({ queryKey });
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
  );
}

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
      {data && <CommentList comments={data.comments} />}
      {canComment &&
        work.state === 'reviewing' &&
        data &&
        (data.hunks.length === 0 ? (
          <p className="muted">{t('commentNeedDiff')}</p>
        ) : (
          <CommentForm projectId={projectId} work={work} data={data} queryKey={key} />
        ))}
    </section>
  );
}
