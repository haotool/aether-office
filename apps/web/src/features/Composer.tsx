import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { SendHorizontal, Square } from 'lucide-react';
import type { AttributedSession, CustomCommand } from '@aether/contracts';
import { api } from '../api.js';
import { usePhoneAny } from '../phone.js';
import { usePreferences } from '../state.js';
import { Modal, useT } from '../ui.js';
import {
  ESC,
  atToken,
  complete,
  rankSlash,
  slashToken,
  type SlashItem,
  type Token,
} from './composer-model.js';
import { ModelChip, QuickReplies } from './ComposerChips.js';
import { ComposerMenu, type MenuRow } from './ComposerMenu.js';
import { slashItems } from './slash-commands.js';
import { useDrive, type Drive } from './use-drive.js';

const MENU_ROWS = 8;

type SlashRow = MenuRow & { item: SlashItem };

/** The box grows with what is typed (CSS caps it at eight lines) and shrinks back when it is sent. */
function useAutoGrow(field: RefObject<HTMLTextAreaElement | null>, text: string) {
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [field, text]);
}

/** The rows of the slash menu: built-ins, skills and the project's own commands, ranked by what was typed. */
function useSlashRows(session: AttributedSession, slash: Token | null): SlashRow[] {
  const t = useT();
  const locale = usePreferences((s) => s.locale);
  const commands = useQuery({
    queryKey: ['session-commands', session.key],
    queryFn: () =>
      api<{ commands: CustomCommand[] }>(
        `/api/local-sessions/${encodeURIComponent(session.key)}/commands`,
      ),
    enabled: !!slash,
    staleTime: 60_000,
    retry: false,
  });
  if (!slash) return [];
  return rankSlash(
    slashItems(session.provider, commands.data?.commands ?? []),
    slash.query,
    MENU_ROWS,
  ).map((item) => ({
    id: item.id,
    item,
    label: `/${item.name}`,
    badge:
      item.kind === 'skill'
        ? t('composerSkill')
        : item.source === 'builtin'
          ? undefined
          : t('composerCustom'),
    hint: [
      typeof item.description === 'string' ? item.description : item.description[locale],
      item.kind === 'picker' ? t('composerPicker') : '',
    ]
      .filter(Boolean)
      .join(' · '),
  }));
}

/** The rows of the `@` menu: the project's files that match what was typed. */
function useFileRows(session: AttributedSession, at: Token | null): MenuRow[] {
  const files = useQuery({
    queryKey: ['session-files', session.key, at?.query ?? ''],
    queryFn: () =>
      api<{ files: string[] }>(
        `/api/local-sessions/${encodeURIComponent(session.key)}/files?q=${encodeURIComponent(at?.query ?? '')}`,
      ),
    enabled: !!at,
    placeholderData: (previous) => previous,
    retry: false,
  });
  return at ? (files.data?.files ?? []).map((f) => ({ id: f, label: f })) : [];
}

/** The completion menu under the box: which token is being completed, its rows, and the highlighted one. */
function useCompletion(session: AttributedSession, text: string, caret: number) {
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const slash = slashToken(text, caret);
  const at = slash ? null : atToken(text, caret);
  const token: Token | null = slash ?? at;
  const slashRows = useSlashRows(session, slash);
  const fileRows = useFileRows(session, at);
  const rows: MenuRow[] = slash ? slashRows : fileRows;
  const here = token ? `${token.start}:${text.slice(0, caret)}` : '';
  return {
    token,
    isSlash: !!slash,
    rows,
    open: !!token && dismissed !== here,
    current: Math.min(active, Math.max(rows.length - 1, 0)),
    setActive,
    dismiss: () => setDismissed(here),
    /** The text a chosen row inserts: `/name ` for a command, `@path ` for a file. */
    insertion: (row: MenuRow) => (slash ? `/${(row as SlashRow).item.name} ` : `@${row.id} `),
  };
}

type Completion = ReturnType<typeof useCompletion>;

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

function SendOrStop({
  stoppable,
  disabled,
  onStop,
  onSend,
}: {
  stoppable: boolean;
  disabled: boolean;
  onStop: () => void;
  onSend: () => void;
}) {
  const t = useT();
  if (stoppable)
    return (
      <button type="button" className="danger composer-send" onClick={onStop}>
        <Square size={15} aria-hidden />
        <span className="composer-send-label">{t('composerStop')}</span>
      </button>
    );
  return (
    <button type="button" className="composer-send" disabled={disabled} onClick={onSend}>
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
        <p className="composer-note" role="status">
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
        enterKeyHint={phone ? 'enter' : 'send'}
        onChange={(e) => edit(e.target.value, e.target.selectionStart)}
        onSelect={(e) => setCaret(e.currentTarget.selectionStart)}
        onKeyDown={(e) => handleComposerKey(e, { menu, phone, pick, submit: () => submit() })}
      />
      <SendOrStop
        stoppable={stoppable}
        disabled={!!blocked || !text.trim()}
        onStop={onStop}
        onSend={() => submit()}
      />
    </div>
  );
}

/**
 * The input for a session AETHER drives (one running in an AETHER terminal). A message is typed into that terminal the
 * way a person would; the conversation shows it at once as a pending bubble and the transcript confirms it. While the
 * session works, Stop (an interrupt) takes the place of Send. Nothing here claims more than the terminal does: what a
 * command opens in the terminal itself is labelled, not answered.
 */
export function Composer({
  session,
  drive,
  working,
}: {
  session: AttributedSession;
  drive: Drive;
  working: boolean;
}) {
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
      <div className="composer-bar">
        <ModelChip session={session} onCommand={(command) => d.send(command)} />
        {phone && (
          <div className="composer-scroll">
            <QuickReplies onReply={(word) => d.send(word)} onEsc={() => void d.sendKey(ESC)} />
          </div>
        )}
      </div>
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
