import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Send, MessageSquare, ArrowUpRight } from 'lucide-react';
import type { MessageWait, Snapshot } from '@aether/contracts';
import { api } from '../api.js';
import { execute } from '../api-commands.js';
import { Empty } from '../ui/Empty.js';
import { Field } from '../ui/Field.js';
import { Badge } from '../ui/Badge.js';
import { PageHeading } from '../ui/PageHeading.js';
import { useT, useWhy } from '../ui/useT.js';
import { Avatar } from './Avatar.js';
import { useRooms } from './Rooms.js';

type Message = Snapshot['messages'][number];

type MessageItemProps = {
  message: Message;
  snapshot: Snapshot;
  canWrite: boolean;
  onReply: (id: string) => void;
};

function MessageItem({ message, snapshot, canWrite, onReply }: MessageItemProps) {
  const t = useT();
  const whyNot = useWhy();
  const sender = snapshot.agents.find((a) => a.id === message.senderId);
  return (
    <article className="message">
      <Avatar seed={sender?.id ?? message.senderId} species={sender?.species ?? 'human'} />
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
              {snapshot.agents.find((a) => a.id === d.recipientId)?.name ?? t('humanRecipient')} ·{' '}
              {d.state === 'available' ? t('messageAvailable') : <Badge state={d.state} />}{' '}
            </span>
          ))}
          <button
            className="text-button"
            disabled={!canWrite}
            {...whyNot([canWrite, 'needOperator'])}
            onClick={() => onReply(message.id)}
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
}

function MessageLog({
  snapshot,
  canWrite,
  onReply,
}: {
  snapshot: Snapshot;
  canWrite: boolean;
  onReply: (id: string) => void;
}) {
  const t = useT();
  const [filter, setFilter] = useState('');
  return (
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
            .map((message) => (
              <MessageItem
                key={message.id}
                message={message}
                snapshot={snapshot}
                canWrite={canWrite}
                onReply={onReply}
              />
            ))}
        </div>
      ) : (
        <Empty title={t('noMessages')} hint={t('noMessagesHint')} />
      )}
    </section>
  );
}

function RoomPicker({
  projectId,
  roomId,
  onChange,
}: {
  projectId: string;
  roomId: string;
  onChange: (id: string) => void;
}) {
  const t = useT();
  const rooms = useRooms(projectId);
  if (!rooms.data?.rooms.length) return null;
  return (
    <Field label={t('room')}>
      <select value={roomId} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t('noRoom')}</option>
        {rooms.data.rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** Who the message goes to (unless it goes to a room) and what kind of message it is. */
function RecipientFields({ agents, toRoom }: { agents: Snapshot['agents']; toRoom: boolean }) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <>
      <Field label={t('recipients')}>
        <select
          name="recipients"
          multiple
          required={!toRoom}
          disabled={toRoom}
          {...whyNot([!toRoom, 'whySendToRoom'])}
          size={Math.min(6, Math.max(2, agents.length))}
        >
          {agents.map((a) => (
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
    </>
  );
}

/** Sending the composed message (to a room or to the chosen recipients); the form is cleared once it went. */
function useSendMessage(
  projectId: string,
  roomId: string,
  replyTo: string | null,
  onSent: () => void,
) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async (form: HTMLFormElement) => {
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
        projectId,
      );
      form.reset();
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'REQUEST_FAILED');
    } finally {
      setBusy(false);
    }
  };
  return { send, busy, error };
}

function SendButton({
  canWrite,
  busy,
  hasAgents,
}: {
  canWrite: boolean;
  busy: boolean;
  hasAgents: boolean;
}) {
  const t = useT();
  const whyNot = useWhy();
  return (
    <button
      className="primary full-width"
      disabled={!canWrite || busy || !hasAgents}
      {...whyNot([canWrite, 'needOperator'], [!busy, 'whyBusy'], [hasAgents, 'whyNoAgents'])}
    >
      {t('send')}
      <Send size={15} />
    </button>
  );
}

function ReplyStrip({ quoted, onCancel }: { quoted: string | undefined; onCancel: () => void }) {
  const t = useT();
  return (
    <div className="reply-strip">
      {t('reply')} · {quoted}
      <button type="button" onClick={onCancel}>
        {t('cancel')}
      </button>
    </div>
  );
}

type ComposePanelProps = {
  snapshot: Snapshot;
  canWrite: boolean;
  replyTo: string | null;
  onReplyDone: () => void;
  onSaved: () => void;
};

function ComposePanel({ snapshot, canWrite, replyTo, onReplyDone, onSaved }: ComposePanelProps) {
  const t = useT();
  const [roomId, setRoomId] = useState('');
  const { send, busy, error } = useSendMessage(snapshot.project.id, roomId, replyTo, () => {
    onReplyDone();
    onSaved();
  });
  return (
    <aside className="compose panel">
      <h2>
        <Send size={17} />
        {t('newMessage')}
      </h2>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(e.currentTarget);
        }}
      >
        <RoomPicker projectId={snapshot.project.id} roomId={roomId} onChange={setRoomId} />
        <RecipientFields agents={snapshot.agents} toRoom={!!roomId} />
        {replyTo && (
          <ReplyStrip
            quoted={snapshot.messages.find((m) => m.id === replyTo)?.body.slice(0, 30)}
            onCancel={onReplyDone}
          />
        )}
        <Field label={t('messageBody')}>
          <textarea required name="body" rows={6} maxLength={16000} />
        </Field>
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
        <SendButton canWrite={canWrite} busy={busy} hasAgents={snapshot.agents.length > 0} />
      </form>
    </aside>
  );
}

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
  const [replyTo, setReplyTo] = useState<string | null>(null);
  return (
    <>
      <PageHeading title={t('messages')} subtitle={t('noMessagesHint')} />
      <div className="messages-layout">
        <MessageLog snapshot={snapshot} canWrite={canWrite} onReply={setReplyTo} />
        <ComposePanel
          snapshot={snapshot}
          canWrite={canWrite}
          replyTo={replyTo}
          onReplyDone={() => setReplyTo(null)}
          onSaved={onSaved}
        />
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
