import { useState } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Plus, BookOpen } from 'lucide-react';
import type { Work } from '@aether/contracts';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { useFormCheck } from './use-form-check.js';
import { Modal } from '../../ui/Modal.js';
import { Field } from '../../ui/Field.js';
import { Fold } from '../../ui/Disclosure.js';
import { PageHeading } from '../../ui/PageHeading.js';
import { Empty } from '../../ui/Empty.js';
import { Badge } from '../../ui/Badge.js';
import { useT, useWhy } from '../../ui/useT.js';
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

/** The reference fields of a proposal that were filled in. */
function filledReferences(data: FormData) {
  return Object.fromEntries(
    ['workId', 'artifactId', 'commitSha'].flatMap((key) =>
      data.get(key) ? [[key, data.get(key)]] : [],
    ),
  );
}

/** Runs the knowledge commands; the error and busy flag are shared by the cards and the proposal form. */
function useKnowledgeActions(projectId: string, refetch: () => Promise<unknown>) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Runs one command and refreshes the list; true when it succeeded. */
  const act = async (command: () => Promise<unknown>) => {
    setBusy(true);
    setError('');
    try {
      await command();
      await refetch();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const decide = (entry: Entry, decision: string, reason: FormDataEntryValue | null) =>
    act(() =>
      execute(
        'knowledge.approve',
        { knowledgeId: entry.id, decision, reason },
        projectId,
        entry.version,
      ),
    );
  const propose = (data: FormData) =>
    act(() =>
      execute(
        'knowledge.propose',
        {
          title: data.get('title'),
          body: data.get('body'),
          source: data.get('source'),
          ...filledReferences(data),
        },
        projectId,
      ),
    );
  return { error, setError, busy, decide, propose };
}

function EntryReferences({ entry }: { entry: Entry }) {
  const t = useT();
  if (!entry.workId && !entry.artifactId && !entry.commitSha) return null;
  return (
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
  );
}

function ApprovalForm({
  busy,
  onDecide,
}: {
  busy: boolean;
  onDecide: (decision: string, reason: FormDataEntryValue | null) => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <Fold title={t('knowledgeReviewReason')}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const decision = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('value');
          if (decision) onDecide(decision, new FormData(e.currentTarget).get('reason'));
        }}
      >
        <Field label={t('knowledgeReviewReason')}>
          <textarea name="reason" required maxLength={2000} />
        </Field>
        <div className="form-actions">
          <button
            value="reject"
            className="secondary"
            disabled={busy}
            {...whyNot([!busy, 'whyBusy'])}
          >
            {t('knowledgeReject')}
          </button>
          <button
            value="approve"
            className="primary"
            disabled={busy}
            {...whyNot([!busy, 'whyBusy'])}
          >
            {t('knowledgeApprove')}
          </button>
        </div>
      </form>
    </Fold>
  );
}

function EntryCard({
  entry,
  canApprove,
  busy,
  onDecide,
}: {
  entry: Entry;
  canApprove: boolean;
  busy: boolean;
  onDecide: (decision: string, reason: FormDataEntryValue | null) => void;
}) {
  const t = useT();
  return (
    <article className="panel">
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
      <EntryReferences entry={entry} />
      {entry.reviewReason && (
        <p className="preserve-space">
          {entry.reviewerName}: {entry.reviewReason}
        </p>
      )}
      {canApprove && entry.classification === 'proposed' && (
        <ApprovalForm busy={busy} onDecide={onDecide} />
      )}
    </article>
  );
}

type Problem = ReturnType<typeof useFormCheck>['problem'];

/** The optional links of a proposal: the work, the artifact and the commit it came from. */
function ReferenceFields({ workItems, problem }: { workItems: Work[]; problem: Problem }) {
  const t = useT();
  return (
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
      <Field label={t('artifactReference')} error={problem('artifactId')}>
        <input name="artifactId" pattern="[0-9a-fA-F-]{36}" />
      </Field>
      <Field label={t('commitReference')} error={problem('commitSha')}>
        <input name="commitSha" pattern="[a-f0-9]{40}([a-f0-9]{24})?" maxLength={64} />
      </Field>
    </details>
  );
}

function ProposeModal({
  workItems,
  error,
  busy,
  onPropose,
  onClose,
}: {
  workItems: Work[];
  error: string;
  busy: boolean;
  onPropose: (data: FormData) => Promise<boolean>;
  onClose: () => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  const { problem, check } = useFormCheck();
  return (
    <Modal title={t('proposeKnowledge')} onClose={onClose}>
      <form
        noValidate
        onSubmit={async (e) => {
          e.preventDefault();
          if (!check(e.currentTarget)) return;
          if (await onPropose(new FormData(e.currentTarget))) onClose();
        }}
      >
        <Field label={t('name')} error={problem('title')}>
          <input name="title" autoFocus required maxLength={160} />
        </Field>
        <Field label={t('body')} error={problem('body')}>
          <textarea name="body" required rows={6} maxLength={32000} />
        </Field>
        <Field label={t('source')} error={problem('source')}>
          <input name="source" required maxLength={2048} />
        </Field>
        <ReferenceFields workItems={workItems} problem={problem} />
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <button className="primary full-width" disabled={busy} {...whyNot([!busy, 'whyBusy'])}>
          {t('save')}
        </button>
      </form>
    </Modal>
  );
}

/** The entries that match the search: loading, the error, the cards or the empty state. */
function EntryList({
  query,
  canApprove,
  busy,
  onDecide,
}: {
  query: UseQueryResult<Entry[]>;
  canApprove: boolean;
  busy: boolean;
  onDecide: (entry: Entry, decision: string, reason: FormDataEntryValue | null) => void;
}) {
  const t = useT();
  if (query.isPending) return <p>{t('loading')}</p>;
  if (query.error)
    return (
      <p role="alert" className="error-text">
        {query.error.message}
      </p>
    );
  if (!query.data?.length) return <Empty title={t('empty')} />;
  return (
    <div className="knowledge-grid">
      {query.data.map((entry) => (
        <EntryCard
          key={entry.id}
          entry={entry}
          canApprove={canApprove}
          busy={busy}
          onDecide={(decision, reason) => onDecide(entry, decision, reason)}
        />
      ))}
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  const t = useT();
  return (
    <div className="search-box">
      <BookOpen size={16} />
      <input
        aria-label={t('search')}
        placeholder={t('search')}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function ProposeButton({ canWrite, onClick }: { canWrite: boolean; onClick: () => void }) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <button
      className="primary"
      onClick={onClick}
      disabled={!canWrite}
      {...whyNot([canWrite, 'needOperator'])}
    >
      <Plus size={16} />
      {t('proposeKnowledge')}
    </button>
  );
}

type KnowledgeProps = {
  projectId: string;
  canWrite: boolean;
  canApprove: boolean;
  workItems: Work[];
};

export function Knowledge({ projectId, canWrite, canApprove, workItems }: KnowledgeProps) {
  const t = useT();
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const entries = useQuery({
    queryKey: ['knowledge', projectId, search],
    queryFn: () =>
      api<Entry[]>(`/api/projects/${projectId}/knowledge?q=${encodeURIComponent(search)}`),
  });
  const { error, setError, busy, decide, propose } = useKnowledgeActions(
    projectId,
    entries.refetch,
  );
  return (
    <>
      <PageHeading
        title={t('knowledgeTitle')}
        subtitle={t('knowledgeTrustNote')}
        action={
          <ProposeButton
            canWrite={canWrite}
            onClick={() => {
              setError('');
              setAdding(true);
            }}
          />
        }
      />
      <SearchBox value={search} onChange={setSearch} />
      <EntryList
        query={entries}
        canApprove={canApprove}
        busy={busy}
        onDecide={(entry, decision, reason) => void decide(entry, decision, reason)}
      />
      {!adding && error && <p role="alert">{error}</p>}
      {adding && (
        <ProposeModal
          workItems={workItems}
          error={error}
          busy={busy}
          onPropose={propose}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}
