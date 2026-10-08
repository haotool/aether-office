import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { SendHorizontal, Square } from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import { usePhoneAny } from '../../lib/preferences/phone.js';
import { Modal } from '../../ui/Modal.js';
import { useT, useWhy } from '../../ui/useT.js';
import { ESC, complete } from '../conversation/composer-model.js';
import { ModelChip, QuickReplies } from './ComposerChips.js';
import { ComposerMenu, type MenuRow } from './ComposerMenu.js';
import { useCompletion, type Completion } from './use-completion.js';
import { useDrive, type Drive } from '../../hooks/use-drive.js';

type ComposerProps = {
  session: AttributedSession;
  drive: Drive;
  working: boolean;
};

/** The box grows with what is typed (CSS caps it at eight lines) and shrinks back when it is sent. */
function useAutoGrow(field: RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [field, text]);
}

/** Arrows move in the open menu, Tab/Enter choose, Escape closes it; otherwise Enter sends on a desktop. */
function handleComposerKey(
  e: KeyboardEvent<HTMLTextAreaElement>,
  ctx: { menu: Completion; phone: boolean; pick: (row: MenuRow) => void; submit: () => void },
) {
  if (e.nativeEvent.isComposing) return; // an IME is choosing a character: Enter belongs to it
  const { menu, phone, pick, submit } = ctx;
  const { open, rows, current } = menu;
  const choosing = e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey);
  if (open && rows.length && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
    e.preventDefault();
    menu.setActive((current + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
  } else if (open && rows.length && choosing) {
    e.preventDefault();
    const row = rows[current];
    if (row) pick(row);
  } else if (open && e.key === 'Escape') {
    menu.dismiss();
  } else if (e.key === 'Enter' && !e.shiftKey && !phone) {
    // A desktop sends on Enter and breaks the line on Shift+Enter; a phone's Enter is a new line (Send is a button).
    e.preventDefault();
    submit();
  }
}

/** What the box says it cannot do, in order of how final it is; empty when it can send. */
function blockedReason(
  d: Pick<ReturnType<typeof useDrive>, 'canWrite' | 'running' | 'free'>,
  t: ReturnType<typeof useT>,
) {
  if (!d.canWrite) return t('composerReadonlyRole');
  if (!d.running) return t('composerEnded');
  return d.free ? '' : t('composerHeld');
}

function StopProcessModal({ onClose, onStop }: { onClose: () => void; onStop: () => void }) {
  const t = useT();
  return (
    <Modal title={t('composerStopProcess')} onClose={onClose}>
      <p>{t('composerStopConfirm')}</p>
      <div className="form-actions">
        <button
          className="danger"
          onClick={() => {
            onClose();
            onStop();
          }}
        >
          {t('composerStopProcess')}
        </button>
      </div>
    </Modal>
  );
}

/** The status line a blocked box explains itself in: what its disabled input and Send point at. */
const COMPOSER_STATUS_ID = 'composer-status';

function SendOrStop({
  stoppable,
  blocked,
  empty,
  onStop,
  onSend,
}: {
  stoppable: boolean;
  blocked: boolean;
  empty: boolean;
  onStop: () => void;
  onSend: () => void;
}) {
  const t = useT();
  const whyNot = useWhy();
  const why = blocked ? { 'aria-describedby': COMPOSER_STATUS_ID } : whyNot([!empty, 'whyNoText']);
  if (stoppable)
    return (
      <button type="button" className="danger composer-send" onClick={onStop}>
        <Square size={15} aria-hidden />
        <span className="composer-send-label">{t('composerStop')}</span>
      </button>
    );
  return (
    <button
      type="button"
      className="composer-send"
      disabled={blocked || empty}
      {...why}
      onClick={onSend}
    >
      <SendHorizontal size={15} aria-hidden />
      <span className="composer-send-label">{t('composerSend')}</span>
    </button>
  );
}

function ComposerNotes({
  working,
  waiting,
  status,
  interrupted,
  onStopProcess,
}: {
  working: boolean;
  waiting: boolean;
  status: string;
  interrupted: boolean;
  onStopProcess: () => void;
}) {
  const t = useT();
  return (
    <>
      {working && waiting && <p className="composer-note">{t('composerBusyNote')}</p>}
      {status && (
        <p id={COMPOSER_STATUS_ID} className="composer-note" role="status">
          {status}
        </p>
      )}
      {interrupted && working && (
        <div className="composer-stop-more">
          <p className="composer-note">{t('composerInterrupted')}</p>
          <button type="button" className="danger" onClick={onStopProcess}>
            {t('composerStopProcess')}
          </button>
        </div>
      )}
    </>
  );
}

type Driven = ReturnType<typeof useDrive>;

/** What is typed, where the caret is, the completion menu under it, and the edits that keep them in step. */
function useComposerEditor(
  session: AttributedSession,
  d: Driven,
  field: RefObject<HTMLTextAreaElement | null>,
) {
  const t = useT();
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [note, setNote] = useState('');
  const menu = useCompletion(session, text, caret);
  useAutoGrow(field, text);
  const edit = (value: string, position: number) => {
    setText(value);
    setCaret(position);
    menu.setActive(0);
    setNote('');
  };
  const pick = (row: MenuRow) => {
    if (!menu.token) return;
    const next = complete(text, caret, menu.token, menu.insertion(row));
    edit(next.text, next.caret);
    requestAnimationFrame(() => field.current?.setSelectionRange(next.caret, next.caret));
  };
  const submit = (value = text) => {
    const result = d.send(value);
    if (result === 'full') return setNote(t('composerQueueFull'));
    if (result === 'queued' && value === text) edit('', 0);
  };
  return { text, setCaret, note, menu, edit, pick, submit };
}

type Editor = ReturnType<typeof useComposerEditor>;

/** The text box with its completion menu, and Send (or Stop while the session works) beside it. */
function ComposerBox({
  field,
  editor,
  blocked,
  stoppable,
  onStop,
}: {
  field: RefObject<HTMLTextAreaElement | null>;
  editor: Editor;
  blocked: string;
  stoppable: boolean;
  onStop: () => void;
}) {
  const t = useT();
  const phone = usePhoneAny();
  const { text, menu, edit, pick, submit, setCaret } = editor;
  return (
    <div className="composer-box">
      {menu.open && menu.token && (
        <ComposerMenu
          title={t(menu.isSlash ? 'composerSlashMenu' : 'composerAtMenu')}
          rows={menu.rows}
          active={menu.current}
          empty={t('composerNoMatch')}
          onPick={pick}
        />
      )}
      <textarea
        ref={field}
        value={text}
        rows={1}
        aria-label={t('composerLabel')}
        placeholder={t('composerPlaceholder')}
        disabled={!!blocked}
        aria-describedby={blocked ? COMPOSER_STATUS_ID : undefined}
        enterKeyHint={phone ? 'enter' : 'send'}
        onChange={(e) => edit(e.target.value, e.target.selectionStart)}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => handleComposerKey(e, { menu, phone, pick, submit: () => submit() })}
      />
      <SendOrStop
        stoppable={stoppable}
        blocked={!!blocked}
        empty={!text.trim()}
        onStop={onStop}
        onSend={() => submit()}
      />
    </div>
  );
}

/** The model chip and, on a phone, the quick replies. */
function ComposerBar({
  session,
  d,
  phone,
}: {
  session: AttributedSession;
  d: Driven;
  phone: boolean;
}) {
  return (
    <div className="composer-bar">
      <ModelChip session={session} onCommand={(command) => d.send(command)} />
      {phone && (
        <div className="composer-scroll">
          <QuickReplies onReply={(word) => d.send(word)} onEsc={() => void d.sendKey(ESC)} />
        </div>
      )}
    </div>
  );
}

/**
 * The input for a session AETHER drives (one running in an AETHER terminal). A message is typed into that terminal the
 * way a person would; the conversation shows it at once as a pending bubble and the transcript confirms it. While the
 * session works, Stop (an interrupt) takes the place of Send. Nothing here claims more than the terminal does: what a
 * command opens in the terminal itself is labelled, not answered.
 */
export function Composer({ session, drive, working }: ComposerProps) {
  const t = useT();
  const phone = usePhoneAny();
  const d = useDrive(session.key, drive, working);
  const field = useRef<HTMLTextAreaElement>(null);
  const editor = useComposerEditor(session, d, field);
  const [interrupted, setInterrupted] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  // Once it has stopped working the interrupt is over, and "stop the process" is no longer offered.
  useEffect(() => {
    if (!working) setInterrupted(false);
  }, [working]);

  const blocked = blockedReason(d, t);
  const status = blocked || (!d.online ? t('composerOffline') : '') || editor.note || d.error;
  return (
    <div className="composer">
      <ComposerBar session={session} d={d} phone={phone} />
      <ComposerBox
        field={field}
        editor={editor}
        blocked={blocked}
        stoppable={working && d.canWrite}
        onStop={() => {
          setInterrupted(true);
          void d.interrupt();
        }}
      />
      <ComposerNotes
        working={working}
        waiting={d.pending.some((p) => p.state === 'queued')}
        status={status}
        interrupted={interrupted}
        onStopProcess={() => setConfirmStop(true)}
      />
      {confirmStop && (
        <StopProcessModal
          onClose={() => setConfirmStop(false)}
          onStop={() => void d.stopProcess()}
        />
      )}
    </div>
  );
}
