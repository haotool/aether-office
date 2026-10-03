import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Agent } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Field, useT } from '../ui.js';

type Meeting = {
  threadId: string;
  topic: string;
  maxRounds: number;
  deadlineAt: number;
  concludedAt: number | null;
  rounds: number;
};

export function Meetings({
  projectId,
  agents,
  canManage,
}: {
  projectId: string;
  agents: readonly Agent[];
  canManage: boolean;
}) {
  const t = useT();
  const client = useQueryClient();
  const [error, setError] = useState('');
  const key = ['meetings', projectId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => api<{ meetings: Meeting[] }>(`/api/projects/${projectId}/meetings`),
    refetchInterval: 5000,
  });
  const run = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      await client.invalidateQueries({ queryKey: key });
      await client.invalidateQueries({ queryKey: ['snapshot', projectId] });
    }
  };
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
              canManage && (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const element = e.currentTarget;
                    const decision = new FormData(element).get('decision');
                    void run(async () => {
                      await execute(
                        'meeting.conclude',
                        { threadId: m.threadId, decision },
                        projectId,
                      );
                      element.reset();
                    });
                  }}
                >
                  <Field label={t('meetingDecision')}>
                    <input name="decision" required maxLength={8000} />
                  </Field>
                  <button type="submit">{t('meetingConclude')}</button>
                </form>
              )
            )}
          </li>
        ))}
      </ul>
      {canManage && (
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
          <Field label={t('meetingParticipants')}>
            <select
              name="participants"
              multiple
              required
              size={Math.min(6, Math.max(2, agents.length))}
            >
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('meetingRounds')}>
            <input name="maxRounds" type="number" min={2} max={12} defaultValue={6} />
          </Field>
          <Field label={t('meetingDeadline')}>
            <input name="deadlineMinutes" type="number" min={5} max={240} defaultValue={30} />
          </Field>
          {error && <p role="alert">{error}</p>}
          <button type="submit">{t('meetingStart')}</button>
        </form>
      )}
    </section>
  );
}
