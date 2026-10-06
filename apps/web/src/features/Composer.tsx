import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
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
  const locale = usePreferences((s) => s.locale);
  const phone = usePhoneAny();
  const d = useDrive(session.key, drive, working);
  const field = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [caret, setCaret] = useState(0);
  const [active, setActive] = useState(0);
  const [dismissed, setDismissed] = useState('');
  const [note, setNote] = useState('');
  const [interrupted, setInterrupted] = useState(false);
  const [confirmStop, setConfirmStop] = useState(false);

  // The box grows with what is typed (CSS caps it at eight lines) and shrinks back when it is sent.
  useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // Once it has stopped working the interrupt is over, and "stop the process" is no longer offered.
  useEffect(() => {
    if (!working) setInterrupted(false);
  }, [working]);

  const slash = slashToken(text, caret);
  const at = slash ? null : atToken(text, caret);
  const token: Token | null = slash ?? at;
  const open = !!token && dismissed !== `${token.start}:${text.slice(0, caret)}`;
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
  const files = useQuery({
    queryKey: ['session-files', session.key, at?.query ?? ''],
    queryFn: () =>
      api<{ files: string[] }>(
        `/api/local-sessions/${encodeURIComponent(session.key)}/files?q=${encodeURIComponent(at!.query)}`,
      ),
    enabled: !!at,
    placeholderData: (previous) => previous,
    retry: false,
  });

  const slashRows: (MenuRow & { item: SlashItem })[] = slash
    ? rankSlash(
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
      }))
    : [];
  const fileRows: MenuRow[] = at ? (files.data?.files ?? []).map((f) => ({ id: f, label: f })) : [];
  const rows = slash ? slashRows : fileRows;
  const current = Math.min(active, Math.max(rows.length - 1, 0));

  const edit = (value: string, position: number) => {
    setText(value);
    setCaret(position);
    setActive(0);
    setNote('');
  };
  const pick = (row: MenuRow) => {
    if (!token) return;
    const insert = slash ? `/${(row as (typeof slashRows)[number]).item.name} ` : `@${row.id} `;
    const next = complete(text, caret, token, insert);
    edit(next.text, next.caret);
    requestAnimationFrame(() => field.current?.setSelectionRange(next.caret, next.caret));
  };
  const submit = (value = text) => {
    const result = d.send(value);
    if (result === 'full') return setNote(t('composerQueueFull'));
    if (result === 'queued' && value === text) edit('', 0);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return; // an IME is choosing a character: Enter belongs to it
    if (open && rows.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setActive((current + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        pick(rows[current]!);
        return;
      }
    }
    if (open && e.key === 'Escape') {
      setDismissed(`${token!.start}:${text.slice(0, caret)}`);
      return;
    }
    // A desktop sends on Enter and breaks the line on Shift+Enter; a phone's Enter is a new line (Send is a button).
    if (e.key === 'Enter' && !e.shiftKey && !phone) {
      e.preventDefault();
      submit();
    }
  };
  const stop = async () => {
    setInterrupted(true);
    await d.interrupt();
  };

  const blocked = !d.canWrite
    ? t('composerReadonlyRole')
    : !d.running
      ? t('composerEnded')
      : !d.free
        ? t('composerHeld')
        : '';
  const waiting = d.pending.some((p) => p.state === 'queued');
  const status = blocked || (!d.online ? t('composerOffline') : '') || note || d.error;
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
      <div className="composer-box">
        {open && token && (
          <ComposerMenu
            title={t(slash ? 'composerSlashMenu' : 'composerAtMenu')}
            rows={rows}
            active={current}
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
          onKeyDown={onKey}
        />
        {working && d.canWrite ? (
          <button type="button" className="danger composer-send" onClick={() => void stop()}>
            <Square size={15} aria-hidden />
            <span className="composer-send-label">{t('composerStop')}</span>
          </button>
        ) : (
          <button
            type="button"
            className="composer-send"
            disabled={!!blocked || !text.trim()}
            onClick={() => submit()}
          >
            <SendHorizontal size={15} aria-hidden />
            <span className="composer-send-label">{t('composerSend')}</span>
          </button>
        )}
      </div>
      {working && waiting && <p className="composer-note">{t('composerBusyNote')}</p>}
      {status && (
        <p className="composer-note" role="status">
          {status}
        </p>
      )}
      {interrupted && working && (
        <div className="composer-stop-more">
          <p className="composer-note">{t('composerInterrupted')}</p>
          <button type="button" className="danger" onClick={() => setConfirmStop(true)}>
            {t('composerStopProcess')}
          </button>
        </div>
      )}
      {confirmStop && (
        <Modal title={t('composerStopProcess')} onClose={() => setConfirmStop(false)}>
          <p>{t('composerStopConfirm')}</p>
          <div className="form-actions">
            <button
              className="danger"
              onClick={() => {
                setConfirmStop(false);
                void d.stopProcess();
              }}
            >
              {t('composerStopProcess')}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
