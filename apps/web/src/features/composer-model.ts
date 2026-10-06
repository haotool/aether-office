/**
 * Pure. What the composer sends into a terminal, in what order, and how a message that is waiting or already sent is
 * kept straight. The order follows what Orca documents for typing into a TUI agent: clear the input line, put the body
 * in (a paste, when it has several lines, so a newline is not an Enter), and press Enter a moment later.
 */
import { fuzzyRank } from '@aether/kernel';

/** One write into the terminal: wait `delayMs` after the previous one, then send `text`. */
export type Step = { text: string; delayMs: number };

export const CLEAR_LINE = '\x15'; // Ctrl+U: kill the line the agent's prompt box is holding
export const ESC = '\x1b';
export const CTRL_C = '\x03';
const ENTER = '\r';
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
/** The Enter goes in after the body has been taken: a busy TUI that gets both at once can lose the Enter. */
export const ENTER_DELAY_MS = 150;
/** The terminal input route takes 8192 characters at a time; the paste markers and the Enter are in that. */
export const MAX_BODY = 8000;
/** Messages that wait for the terminal (offline, busy): more than this are refused, not piled up without end. */
export const MAX_QUEUE = 10;
/** After a send the session takes a moment to show as working; a waiting message is not sent into that gap. */
export const SETTLE_MS = 8000;
/** A sent message the transcript has not shown after this long is flagged rather than left looking delivered. */
export const UNCONFIRMED_MS = 90_000;
const SKEW_MS = 60_000;

/** Pure. Text as it may go to a terminal: line ends are `\n`, and no control character that is not a newline or a tab. */
export function sanitizeBody(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .slice(0, MAX_BODY);
}

/** Pure. The writes that deliver `text` as one message, or none when there is nothing to send. */
export function sequenceFor(text: string): Step[] {
  const body = sanitizeBody(text).trim();
  if (!body) return [];
  return [
    { text: CLEAR_LINE, delayMs: 0 },
    { text: body.includes('\n') ? `${PASTE_START}${body}${PASTE_END}` : body, delayMs: 0 },
    { text: ENTER, delayMs: ENTER_DELAY_MS },
  ];
}

/** The quick replies of a phone: words that answer most prompts, and Esc, which backs out of one. */
export const QUICK_REPLIES = [
  { id: 'continue', send: 'continue' },
  { id: 'yes', send: 'yes' },
  { id: 'no', send: 'no' },
  { id: 'esc', send: null },
] as const;

export type Pending = {
  /** Made when the message is written; the key of its bubble and what a retry or a dismiss names. */
  localId: string;
  text: string;
  at: number;
  state: 'queued' | 'sending' | 'sent' | 'failed';
  error?: string;
};

/** Pure. The queue with `item` added, or null when it is full. */
export function enqueue(list: readonly Pending[], item: Pending): Pending[] | null {
  return list.filter((p) => p.state === 'queued').length >= MAX_QUEUE ? null : [...list, item];
}

export type SendGate = {
  online: boolean;
  /** AETHER holds (or can take) the terminal: nobody else's lease is running on it. */
  free: boolean;
  working: boolean;
  /** Nothing is sent before this time: the settle gap after the last send. */
  holdUntil: number;
  now: number;
};

/** Pure. May a waiting message go now? */
export const canSend = (g: SendGate): boolean =>
  g.online && g.free && !g.working && g.now >= g.holdUntil;

/** Pure. The oldest message still waiting. */
export const nextQueued = (list: readonly Pending[]): Pending | undefined =>
  list.find((p) => p.state === 'queued');

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

/**
 * Pure. Which sent messages the transcript now shows, so their pending bubbles can give way to the real ones. A message
 * is matched by its text (whitespace folded) to a prompt of the transcript written no earlier than shortly before it
 * was sent; each prompt of the transcript answers one message only, so the same words sent twice show twice.
 */
export function seenIn(
  pending: readonly Pending[],
  prompts: readonly { text: string; at: number | null }[],
): Set<string> {
  const used = new Set<number>();
  const seen = new Set<string>();
  for (const item of pending) {
    if (item.state !== 'sent') continue;
    const want = squash(sanitizeBody(item.text));
    const index = prompts.findIndex(
      (p, i) =>
        !used.has(i) && squash(p.text) === want && (p.at === null || p.at >= item.at - SKEW_MS),
    );
    if (index < 0) continue;
    used.add(index);
    seen.add(item.localId);
  }
  return seen;
}

/** Pure. A sent message that has waited too long for the transcript to show it. */
export const isUnconfirmed = (item: Pending, now: number): boolean =>
  item.state === 'sent' && now - item.at > UNCONFIRMED_MS;

/** Pure. The command that picks a model: Claude takes it as text, Codex only opens its own picker. */
export function modelCommand(provider: 'claude' | 'codex', id: string): string | null {
  if (provider === 'codex') return '/model';
  return /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,63}$/.test(id) ? `/model ${id}` : null;
}

/** Pure. The command that sets the effort of the session: only Claude has one as text. */
export function effortCommand(provider: 'claude' | 'codex', effort: string): string | null {
  return provider === 'claude' && /^[a-z]{3,10}$/.test(effort) ? `/effort ${effort}` : null;
}

export type SlashItem = {
  id: string;
  /** What follows the slash. */
  name: string;
  description: { en: string; 'zh-TW': string } | string;
  source: 'builtin' | 'project' | 'user';
  /** `picker` commands open a list in the terminal itself: AETHER sends them but cannot answer the list. */
  kind: 'text' | 'picker' | 'command' | 'skill';
};

/** A word being completed: what has been typed of it, and where it starts in the text. */
export type Token = { query: string; start: number };

/** Pure. The slash command being typed: a `/` that opens the message, with no space after it yet. */
export function slashToken(text: string, caret: number): Token | null {
  const before = text.slice(0, caret);
  const m = /^\/([A-Za-z0-9._:-]*)$/.exec(before);
  return m ? { query: m[1]!, start: 0 } : null;
}

/** Pure. The `@` file being typed: an `@` at the start of the text or after a space, up to the caret. */
export function atToken(text: string, caret: number): Token | null {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(before);
  return m ? { query: m[1]!, start: before.length - m[1]!.length - 1 } : null;
}

/** Pure. The menu of slash commands for what has been typed: fuzzy on the name, builtin before custom on a tie. */
export function rankSlash(items: readonly SlashItem[], query: string, limit = 8): SlashItem[] {
  const order = { builtin: 0, project: 1, user: 2 };
  const sorted = [...items].sort((a, b) => order[a.source] - order[b.source]);
  return fuzzyRank(query, sorted, (i) => i.name, limit);
}

/** Pure. `text` with the token it was completing replaced by `insert`, and where the caret goes after it. */
export function complete(text: string, caret: number, token: Token, insert: string) {
  const next = `${text.slice(0, token.start)}${insert}${text.slice(caret)}`;
  return { text: next, caret: token.start + insert.length };
}
