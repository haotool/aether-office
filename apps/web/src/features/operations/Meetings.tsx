import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api/api.js';
import { execute } from '../../lib/api/api-commands.js';
import { Field } from '../../ui/Field.js';
import { useT } from '../../ui/useT.js';
import { AgentPicker, useCommandRunner, type AgentPanelProps } from '../shell-chrome/panel-kit.js';
import { POLL, poll } from '../../lib/app/polling.js';

type Meeting = {
  threadId: string;
  topic: string;
  maxRounds: number;
  deadlineAt: number;
  concludedAt: number | null;
  rounds: number;
};
type Run = (fn: () => Promise<unknown>) => Promise<void>;

function ConcludeForm({
  projectId,
  threadId,
  run,
}: {
  projectId: string;
  threadId: string;
  run: Run;
}) {
  const t = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const element = e.currentTarget;
        const decision = new FormData(element).get('decision');
        void run(async () => {
          await execute('meeting.conclude', { threadId, decision }, projectId);
          element.reset();
        });
      }}
    >
      <Field label={t('meetingDecision')}>
        <input name="decision" required maxLength={8000} />
      </Field>
      <button type="submit">{t('meetingConclude')}</button>
    </form>
  );
}

type StartMeetingFormProps = {
  projectId: string;
  agents: AgentPanelProps['agents'];
  error: string;
  run: Run;
};

function StartMeetingForm({ projectId, agents, error, run }: StartMeetingFormProps) {
  const t = useT();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const element = e.currentTarget;
        const form = new FormData(element);
        void run(async () => {
          await execute(
            'meeting.start',
            {
              topic: form.get('topic'),
              question: form.get('question'),
              participants: form.getAll('participants'),
              maxRounds: Number(form.get('maxRounds')),
              deadlineMinutes: Number(form.get('deadlineMinutes')),
            },
            projectId,
          );
          element.reset();
        });
      }}
    >
      <Field label={t('meetingTopic')}>
        <input name="topic" required maxLength={160} />
      </Field>
      <Field label={t('meetingQuestion')}>
        <textarea name="question" required maxLength={8000} rows={2} />
      </Field>
      <AgentPicker name="participants" label={t('meetingParticipants')} agents={agents} />
      <Field label={t('meetingRounds')}>
        <input name="maxRounds" type="number" min={2} max={12} defaultValue={6} />
      </Field>
      <Field label={t('meetingDeadline')}>
        <input name="deadlineMinutes" type="number" min={5} max={240} defaultValue={30} />
      </Field>
      {error && <p role="alert">{error}</p>}
      <button type="submit">{t('meetingStart')}</button>
    </form>
  );
}

export function Meetings({ projectId, agents, canManage }: AgentPanelProps) {
  const t = useT();
  const key = ['meetings', projectId];
  const { error, run } = useCommandRunner([key, ['snapshot', projectId]], true);
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<{ meetings: Meeting[] }>(`/api/projects/${projectId}/meetings`),
    ...poll(POLL.list),
  });
  return (
    <section aria-labelledby="meetings-title">
      <h2 id="meetings-title">{t('meetings')}</h2>
      <p className="muted">{t('meetingsNote')}</p>
      <ul className="plain-list">
        {query.data?.meetings.map((m) => (
          <li key={m.threadId} className="panel">
            <strong>{m.topic}</strong> · {m.rounds}/{m.maxRounds} ·{' '}
            {new Date(m.deadlineAt).toLocaleTimeString()}{' '}
            {m.concludedAt ? (
              <span>{t('meetingConcluded')}</span>
            ) : (
              canManage && <ConcludeForm projectId={projectId} threadId={m.threadId} run={run} />
            )}
          </li>
        ))}
      </ul>
      {canManage && (
        <StartMeetingForm projectId={projectId} agents={agents} error={error} run={run} />
      )}
    </section>
  );
}
