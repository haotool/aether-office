import type { Snapshot, Work } from '@aether/contracts';
import { Modal } from '../../ui/Modal.js';
import { Badge } from '../../ui/Badge.js';
import { Fold, Clamp } from '../../ui/Disclosure.js';
import { useT } from '../../ui/useT.js';
import { Integration } from '../integrations/Integration.js';
import { TaskDiagnostics } from './TaskDiagnostics.js';
import {
  AssignForm,
  AttemptLimit,
  CancelControls,
  DependencyEditor,
  RetryControls,
  useTaskCommand,
} from './TaskActions.js';

type TaskDetailProps = {
  snapshot: Snapshot;
  work: Work;
  onClose: () => void;
  onSaved: () => void;
  canWrite: boolean;
  canExtend: boolean;
};

function dependencyLine(snapshot: Snapshot, work: Work, t: ReturnType<typeof useT>): string {
  return (
    snapshot.dependencies
      .filter((d) => d.workId === work.id)
      .map((d) => {
        const prerequisite = snapshot.work.find((w) => w.id === d.dependsOn);
        return prerequisite ? `${prerequisite.title} (${t(prerequisite.state)})` : d.dependsOn;
      })
      .join('、') || '—'
  );
}

function TaskFacts({ snapshot, work }: { snapshot: Snapshot; work: Work }) {
  const t = useT();
  return (
    <>
      <Badge state={work.state} />
      {work.cancelCause && (
        <p>
          {t('dependencyCancellation')}:{' '}
          {snapshot.work.find((w) => w.id === work.cancelCause)?.title ?? work.cancelCause}
        </p>
      )}
      <Clamp className="preserve-space">{work.description}</Clamp>
      <Fold title={t('workDiagnosis')}>
        <TaskDiagnostics projectId={snapshot.project.id} workId={work.id} version={work.version} />
      </Fold>
      <Fold title={t('acceptance')}>
        <p className="preserve-space">{work.acceptance}</p>
      </Fold>
      <p className="fold-line">
        {t('dependencies')}: {dependencyLine(snapshot, work, t)}
      </p>
      {work.result && (
        <Fold title={t('result')} open>
          <Clamp className="result-text">{work.result}</Clamp>
        </Fold>
      )}
      <details className="fold-line">
        <summary>{t('details')}</summary>
        {t('version')} {work.version} · {work.id.slice(0, 8)}
      </details>
    </>
  );
}

export function TaskDetail({
  snapshot,
  work,
  onClose,
  onSaved,
  canWrite,
  canExtend,
}: TaskDetailProps) {
  const { error, setError, busy, command } = useTaskCommand(snapshot.project.id, onSaved);
  const action = { snapshot, work, canWrite, busy, command };
  const retryable = ['failed', 'changes_requested'].includes(work.state);
  return (
    <Modal
      title={work.title}
      onClose={() => {
        onClose();
        setError('');
      }}
    >
      <TaskFacts snapshot={snapshot} work={work} />
      {['ready', 'backlog'].includes(work.state) && work.attempt === 0 && (
        <DependencyEditor {...action} />
      )}
      {work.state === 'ready' && <AssignForm {...action} />}
      {retryable && <RetryControls {...action} />}
      {retryable && work.attempt >= work.maxAttempts && (
        <AttemptLimit work={work} canExtend={canExtend} busy={busy} command={command} />
      )}
      {!['completed', 'cancelled'].includes(work.state) && (
        <CancelControls work={work} canWrite={canWrite} busy={busy} command={command} />
      )}
      {work.state === 'completed' && (
        <Integration
          projectId={snapshot.project.id}
          work={work}
          canIntegrate={canExtend}
          onSaved={onSaved}
        />
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
    </Modal>
  );
}
