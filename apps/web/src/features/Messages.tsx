import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Send, MessageSquare, ArrowUpRight } from 'lucide-react';
import type { MessageWait, Snapshot } from '@aether/contracts';
import { api, execute } from '../api.js';
import { Empty, Field, Badge, PageHeading, useT, whyNot } from '../ui.js';
import { Avatar } from './Avatar.js';
import { useRooms } from './Rooms.js';
export function Messages({
  snapshot,
  onSaved,
  canWrite,
}: {
  snapshot: Snapshot;
  onSaved: () => void;
  canWrite: boolean;
}) {
  const t = useT();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [roomId, setRoomId] = useState('');
  const rooms = useRooms(snapshot.project.id);
  return (
    <>
      <PageHeading title={t('messages')} subtitle={t('noMessagesHint')} />
      <div className="messages-layout">
        <section className="conversation">
          <div className="search-box">
            <MessageSquare size={16} />
            <input
              aria-label={t('search')}
              placeholder={t('search')}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          {snapshot.messages.length ? (
            <div className="message-log">
              {snapshot.messages
                .filter((m) => m.body.toLocaleLowerCase().includes(filter.toLocaleLowerCase()))
                .map((message) => {
                  const sender = snapshot.agents.find((a) => a.id === message.senderId);
                  return (
                    <article className="message" key={message.id}>
                      <Avatar
                        seed={sender?.id ?? message.senderId}
                        species={sender?.species ?? 'human'}
                      />
                      <div className="message-content">
                        <header>
                          <strong>{sender?.name ?? t('you')}</strong>
                          <time>
                            {new Date(message.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </time>
                          <Badge state={message.kind} />
                        </header>
                        <p>{message.body}</p>
                        <footer>
                          {message.deliveries.map((d) => (
                            <span key={d.recipientId}>
                              {snapshot.agents.find((a) => a.id === d.recipientId)?.name ??
                                t('humanRecipient')}{' '}
                              ·{' '}
                              {d.state === 'available' ? (
                                t('messageAvailable')
                              ) : (
                                <Badge state={d.state} />
                              )}{' '}
                            </span>
                          ))}
                          <button
                            className="text-button"
                            disabled={!canWrite}
                            {...whyNot(canWrite, t('needOperator'))}
                            onClick={() => setReplyTo(message.id)}
                          >
                            {t('reply')}
                            <ArrowUpRight size={13} />
                          </button>
                        </footer>
                        {message.kind === 'request' && (
                          <RequestWaits
                            projectId={snapshot.project.id}
                            messageId={message.id}
                            agents={snapshot.agents}
                          />
                        )}
                      </div>
                    </article>
                  );
                })}
            </div>
          ) : (
            <Empty title={t('noMessages')} hint={t('noMessagesHint')} />
          )}
        </section>
        <aside className="compose panel">
          <h2>
            <Send size={17} />
            {t('newMessage')}
          </h2>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const form = e.currentTarget;
              const data = new FormData(form);
              setBusy(true);
              setError('');
              try {
                await execute(
                  'message.send',
                  {
                    ...(roomId ? { roomId } : { recipients: data.getAll('recipients') }),
                    body: data.get('body'),
                    kind: data.get('kind'),
                    ...(replyTo ? { replyTo } : {}),
                  },
                  snapshot.project.id,
                );
                form.reset();
                setReplyTo(null);
                onSaved();
              } catch (e) {
                setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
              } finally {
                setBusy(false);
              }
            }}
          >
            {!!rooms.data?.rooms.length && (
              <Field label={t('room')}>
                <select value={roomId} onChange={(e) => setRoomId(e.target.value)}>
                  <option value="">{t('noRoom')}</option>
                  {rooms.data.rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            <Field label={t('recipients')}>
              <select
                name="recipients"
                multiple
                required={!roomId}
                disabled={!!roomId}
                size={Math.min(6, Math.max(2, snapshot.agents.length))}
              >
                {snapshot.agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('kind')}>
              <select name="kind">
                <option value="inform">{t('inform')}</option>
                <option value="request">{t('request')}</option>
                <option value="decision">{t('decision')}</option>
                <option value="handoff">{t('handoff')}</option>
              </select>
            </Field>
            {replyTo && (
              <div className="reply-strip">
                {t('reply')} · {snapshot.messages.find((m) => m.id === replyTo)?.body.slice(0, 30)}
                <button type="button" onClick={() => setReplyTo(null)}>
                  {t('cancel')}
                </button>
              </div>
            )}
            <Field label={t('messageBody')}>
              <textarea required name="body" rows={6} maxLength={16000} />
            </Field>
            {error && (
              <p role="alert" className="error-text">
                {error}
              </p>
            )}
            <button
              className="primary full-width"
              disabled={!canWrite || busy || !snapshot.agents.length}
            >
              {t('send')}
              <Send size={15} />
            </button>
          </form>
        </aside>
      </div>
    </>
  );
}

function RequestWaits({
  projectId,
  messageId,
  agents,
}: {
  projectId: string;
  messageId: string;
  agents: Snapshot['agents'];
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const query = useQuery({
    queryKey: ['message-waits', projectId, messageId],
    queryFn: () => api<MessageWait[]>(`/api/projects/${projectId}/messages/${messageId}/waits`),
    enabled: open,
    staleTime: 0,
    refetchInterval: open ? 2000 : false,
  });
  return (
    <details onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>{t('requestWaits')}</summary>
      {query.isLoading && <p>{t('loading')}</p>}
      {query.error && <p role="alert">{query.error.message}</p>}
      {query.data?.length === 0 && <p>{t('noWaitRecord')}</p>}
      {query.data?.map((wait) => (
        <div key={wait.recipientId}>
          <p>
            {agents.find((a) => a.id === wait.recipientId)?.name ?? t('humanRecipient')} ·{' '}
            {wait.state === 'pending' ? t('waitingReply') : t(wait.state)}
          </p>
          <p className="muted">
            {t('replyDeadline')}:{' '}
            <time dateTime={new Date(wait.deadline).toISOString()}>
              {new Date(wait.deadline).toLocaleString()}
            </time>
          </p>
          {wait.replyId && (
            <p className="muted">
              {t('replyReference')}: {wait.replyId}
            </p>
          )}
        </div>
      ))}
    </details>
  );
}
