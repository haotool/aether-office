import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Copy,
  Crosshair,
  CornerDownLeft,
  DoorOpen,
  GitFork,
  Hand,
  List,
  MessageSquare,
  Monitor,
  Pin,
  Play,
  Power,
  Send,
} from 'lucide-react';
import type { AttributedSession } from '@aether/contracts';
import type { CharacterMenuContext } from '@aether/office-scene';
import { EMOTES, type EmoteId } from '@aether/office-scene/model';
import { copyText } from '../browser-compat.js';
import type { Key } from '../i18n.js';
import { sessionCommands } from '../localSessions.js';
import { Sheet, useT } from '../ui.js';
import {
  actionsFor,
  stopRoute,
  type ActionId,
  type CharacterAction,
  type CharacterFacts,
} from './character-actions.js';
import { MessageBubble, useTerminalSend } from './CharacterMessage.js';
import {
  clockOutKeys,
  kindOf,
  sessionOf,
  useActor,
  useTerminalState,
} from './character-session.js';
import { QUICK_REPLIES } from './composer-model.js';
import { useContinue } from './use-continue.js';
import { MENU_KEYS, nextMenuIndex } from './menu-nav.js';
import type { Drive } from './use-drive.js';

/** What the menu hands the page to do, because it needs a dialog or the whole scene: the menu itself closes. */
export type CharacterCommand =
  | { type: 'stop-terminal'; session: AttributedSession; drive: Drive }
  | { type: 'stop-process'; session: AttributedSession }
  | { type: 'send-home'; keys: string[] };

const LABEL: Record<ActionId, Key> = {
  open: 'panelOpenConversation',
  follow: 'charFollow',
  screen: 'charScreen',
  message: 'charMessage',
  continue: 'continueHere',
  replies: 'composerQuick',
  copy_resume: 'copyResume',
  fork: 'forkHere',
  interrupt: 'charInterrupt',
  stop: 'charStop',
  send_home: 'charSendHome',
  pin: 'charPin',
  feed: 'charFeed',
};
const ICON: Record<ActionId, ReactNode> = {
  open: <MessageSquare size={16} />,
  follow: <Crosshair size={16} />,
  screen: <Monitor size={16} />,
  message: <Send size={16} />,
  continue: <Play size={16} />,
  replies: <CornerDownLeft size={16} />,
  copy_resume: <Copy size={16} />,
  fork: <GitFork size={16} />,
  interrupt: <Hand size={16} />,
  stop: <Power size={16} />,
  send_home: <DoorOpen size={16} />,
  pin: <Pin size={16} />,
  feed: <List size={16} />,
};
const EMOTE_LABEL: Record<EmoteId, Key> = {
  wave: 'emoteWave',
  thumbs_up: 'emoteThumbsUp',
  high_five: 'emoteHighFive',
  cheer: 'emoteCheer',
  stretch: 'emoteStretch',
  pat: 'emotePat',
};
const REPLY_LABEL = { continue: 'composerContinue', yes: 'composerYes', no: 'composerNo' } as const;

type MenuProps = {
  ctx: CharacterMenuContext;
  sessions: readonly AttributedSession[];
  projectId: string;
  leaving: boolean;
  onOpen: (id: string) => void;
  onFeed: (id: string) => void;
  onCommand: (command: CharacterCommand) => void;
  onNotice: (message: string) => void;
};
type Panel = 'message' | 'replies' | null;

/** What the menu knows about its character: the session, who is asking, the terminal, and the facts for the rules. */
function useCharacterFacts({ ctx, sessions, projectId, leaving }: MenuProps) {
  const actor = useActor();
  const session = sessionOf(sessions, ctx.agent);
  const terminal = useTerminalState(session, actor.id);
  const resume = useContinue(session, projectId);
  const send = useTerminalSend(session, terminal.drive, actor.id);
  const facts: CharacterFacts = {
    kind: kindOf(ctx.id),
    role: actor.role,
    process: session?.process ?? null,
    liveness: session?.liveness.state ?? null,
    drive: terminal.state,
    working: ctx.agent.activity === 'working',
    profile: !!resume.target,
    clockOut: clockOutKeys(sessions, [ctx.id]).length > 0,
    leaving,
    following: ctx.scene.followed,
    pinned: ctx.scene.pinned,
    wall: ctx.scene.canPin,
  };
  return { session, terminal, resume, send, facts };
}

/** What each action does when chosen; most close the menu, with a notice when there is something to say. */
function useActionRunners(
  props: MenuProps,
  known: ReturnType<typeof useCharacterFacts>,
  panel: Panel,
  setPanel: (panel: Panel) => void,
) {
  const t = useT();
  const { ctx, onOpen, onFeed, onCommand, onNotice } = props;
  const { session, terminal, resume, send, facts } = known;
  const done = (notice?: string) => {
    if (notice) onNotice(notice);
    ctx.close();
  };
  const toggle = (which: 'message' | 'replies') => setPanel(panel === which ? null : which);
  const stop = () => {
    const route = stopRoute(facts);
    if (session && route === 'terminal' && terminal.drive)
      onCommand({ type: 'stop-terminal', session, drive: terminal.drive });
    else if (session && route === 'process') onCommand({ type: 'stop-process', session });
    done();
  };
  const run: Record<ActionId, () => void | Promise<void>> = {
    open: () => (onOpen(ctx.id), done()),
    follow: () => (ctx.scene.toggleFollow(), done()),
    screen: () => (ctx.scene.lookAtScreen(), done()),
    message: () => toggle('message'),
    replies: () => toggle('replies'),
    continue: async () => done(await resume.start(false)),
    fork: async () => done(await resume.start(true)),
    copy_resume: async () =>
      done(session && (await copyText(sessionCommands(session).resume)) ? t('copied') : ''),
    interrupt: async () => {
      if (await send.escape()) done(t('charInterrupted'));
    },
    stop,
    send_home: () => (session && onCommand({ type: 'send-home', keys: [session.key] }), done()),
    pin: () => (ctx.scene.togglePin(), done()),
    feed: () => (onFeed(ctx.id), done()),
  };
  return { run, done };
}

type TerminalSend = ReturnType<typeof useTerminalSend>;

function QuickReplyButtons({
  send,
  done,
}: {
  send: TerminalSend;
  done: (notice?: string) => void;
}) {
  const t = useT();
  return (
    <div className="char-replies">
      {QUICK_REPLIES.filter((r) => r.send !== null).map((r) => (
        <button
          key={r.id}
          type="button"
          disabled={send.busy}
          onClick={async () => {
            if (r.send && (await send.message(r.send))) done(t('charMessageSent'));
          }}
        >
          {t(REPLY_LABEL[r.id as keyof typeof REPLY_LABEL])}
        </button>
      ))}
      {send.error && (
        <p role="alert" className="error">
          {send.error}
        </p>
      )}
    </div>
  );
}

function ActionItem({
  a,
  panel,
  send,
  run,
  done,
}: {
  a: CharacterAction;
  panel: Panel;
  send: TerminalSend;
  run: () => void | Promise<void>;
  done: (notice?: string) => void;
}) {
  const t = useT();
  return (
    <li role="none" data-action={a.id}>
      <button
        type="button"
        role="menuitem"
        className={`char-item ${a.id === 'stop' || a.id === 'send_home' ? 'danger' : ''}`}
        aria-disabled={!a.enabled}
        aria-expanded={a.id === 'message' || a.id === 'replies' ? panel === a.id : undefined}
        data-on={a.on || undefined}
        onClick={() => a.enabled && void run()}
      >
        {ICON[a.id]}
        <span>
          {a.id === 'pin' && a.on ? t('charUnpin') : t(LABEL[a.id])}
          {a.reason && <small>{t(a.reason)}</small>}
        </span>
      </button>
      {a.id === 'message' && panel === 'message' && a.enabled && (
        <MessageBubble
          busy={send.busy}
          error={send.error}
          onSend={async (text) => {
            const sent = await send.message(text);
            if (sent) done(t('charMessageSent'));
            return sent;
          }}
        />
      )}
      {a.id === 'replies' && panel === 'replies' && a.enabled && (
        <QuickReplyButtons send={send} done={done} />
      )}
    </li>
  );
}

function EmoteRow({ ctx }: { ctx: CharacterMenuContext }) {
  const t = useT();
  return (
    <li role="none" className="char-react">
      <small id="char-react">{t('charReact')}</small>
      <div role="group" aria-labelledby="char-react">
        {EMOTES.map((emote) => (
          <button
            key={emote.id}
            type="button"
            role="menuitem"
            aria-disabled={ctx.scene.emoteBlocked !== null}
            title={t(EMOTE_LABEL[emote.id])}
            aria-label={t(EMOTE_LABEL[emote.id])}
            onClick={() => {
              if (ctx.scene.emoteBlocked) return;
              ctx.scene.emote(emote.id);
              ctx.close();
            }}
          >
            <span aria-hidden="true">{emote.icon}</span>
          </button>
        ))}
      </div>
      <small>{t('charReactNote')}</small>
    </li>
  );
}

/** Arrow keys, Home and End move focus between the menu items (a textarea inside keeps its own keys). */
function moveFocus(root: HTMLElement | null, e: KeyboardEvent) {
  if (!MENU_KEYS.includes(e.key) || e.target instanceof HTMLTextAreaElement) return;
  const items = [...(root?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [])];
  const at = items.indexOf(document.activeElement as HTMLElement);
  e.preventDefault();
  items[nextMenuIndex(e.key, at, items.length)]?.focus();
}

/**
 * The action menu of one character: what can really be done with it, each action enabled or disabled with its reason
 * (see character-actions.ts), and the emotes. Beside the character on a desktop (arrow keys move, Esc closes), in a
 * bottom sheet on a phone.
 */
export function CharacterMenu(props: MenuProps) {
  const { ctx } = props;
  const t = useT();
  const known = useCharacterFacts(props);
  const [panel, setPanel] = useState<Panel>(null);
  const { run, done } = useActionRunners(props, known, panel, setPanel);
  const root = useRef<HTMLElement | null>(null);
  useEffect(() => {
    root.current?.querySelector<HTMLElement>('[data-action="open"] [role="menuitem"]')?.focus();
  }, []);

  const body = (
    <>
      <EmoteRow ctx={ctx} />
      {actionsFor(known.facts).map((a) => (
        <ActionItem key={a.id} a={a} panel={panel} send={known.send} run={run[a.id]} done={done} />
      ))}
    </>
  );
  if (ctx.compact)
    return (
      <Sheet title={ctx.agent.name} onClose={ctx.close}>
        {body}
      </Sheet>
    );
  return (
    <ul
      className="char-menu"
      role="menu"
      aria-label={`${t('charMenuLabel')}: ${ctx.agent.name}`}
      ref={(node) => {
        root.current = node;
      }}
      onKeyDown={(e) => moveFocus(root.current, e)}
    >
      <li role="presentation" className="char-menu-title">
        {ctx.agent.name}
      </li>
      {body}
    </ul>
  );
}
