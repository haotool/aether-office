import { fuzzyRank } from '@aether/kernel';

export type Step = { text: string; delayMs: number };

export const CLEAR_LINE = '\x15';
export const ESC = '\x1b';
export const CTRL_C = '\x03';
const ENTER = '\r';
const PASTE_START = '\x1b[200~';
const PASTE_END = '\x1b[201~';
export const ENTER_DELAY_MS = 150;
export const MAX_BODY = 8000;
/** Messages that wait for the terminal (offline, busy): more than this are refused, not piled up without end. */
export const MAX_QUEUE = 10;
export const SETTLE_MS = 8000;
/** A sent message the transcript has not shown after this long is flagged rather than left looking delivered. */
const UNCONFIRMED_MS = 90_000;
const SKEW_MS = 60_000;

export function sanitizeBody(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .replace(/[\x00-\x08\x0b-\x1f\x7f]/g, '')
    .slice(0, MAX_BODY);
}

export function sequenceFor(text: string): Step[] {
  const body = sanitizeBody(text).trim();
  if (!body) return [];
  return [
    { text: CLEAR_LINE, delayMs: 0 },
    { text: body.includes('\n') ? `${PASTE_START}${body}${PASTE_END}` : body, delayMs: 0 },
    { text: ENTER, delayMs: ENTER_DELAY_MS },
  ];
}

export const QUICK_REPLIES = [
  { id: 'continue', send: 'continue' },
  { id: 'yes', send: 'yes' },
  { id: 'no', send: 'no' },
  { id: 'esc', send: null },
] as const;

export type Pending = {
  localId: string;
  text: string;
  at: number;
  state: 'queued' | 'sending' | 'sent' | 'failed';
  error?: string;
};

export function enqueue(list: readonly Pending[], item: Pending): Pending[] | null {
  return list.filter((p) => p.state === 'queued').length >= MAX_QUEUE ? null : [...list, item];
}

type SendGate = {
  online: boolean;
  free: boolean;
  working: boolean;
  holdUntil: number;
  now: number;
};

export const canSend = (g: SendGate): boolean =>
  g.online && g.free && !g.working && g.now >= g.holdUntil;

export const nextQueued = (list: readonly Pending[]): Pending | undefined =>
  list.find((p) => p.state === 'queued');

const squash = (text: string) => text.replace(/\s+/g, ' ').trim();

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

export const isUnconfirmed = (item: Pending, now: number): boolean =>
  item.state === 'sent' && now - item.at > UNCONFIRMED_MS;

/** Pure. The command that picks a model: Claude takes it as text, Codex only opens its own picker. */
export function modelCommand(provider: 'claude' | 'codex', id: string): string | null {
  if (provider === 'codex') return '/model';
  return /^[A-Za-z0-9][A-Za-z0-9._[\]-]{0,63}$/.test(id) ? `/model ${id}` : null;
}

export function effortCommand(provider: 'claude' | 'codex', effort: string): string | null {
  return provider === 'claude' && /^[a-z]{3,10}$/.test(effort) ? `/effort ${effort}` : null;
}

export type SlashItem = {
  id: string;
  name: string;
  description: { en: string; 'zh-TW': string } | string;
  source: 'builtin' | 'project' | 'user';
  /** `picker` commands open a list in the terminal itself: AETHER sends them but cannot answer the list. */
  kind: 'text' | 'picker' | 'command' | 'skill';
};

export type Token = { query: string; start: number };

export function slashToken(text: string, caret: number): Token | null {
  const before = text.slice(0, caret);
  const m = /^\/([A-Za-z0-9._:-]*)$/.exec(before);
  if (!m || m[1] === undefined) return null;
  return { query: m[1], start: 0 };
}

export function atToken(text: string, caret: number): Token | null {
  const before = text.slice(0, caret);
  const m = /(?:^|\s)@([^\s@]*)$/.exec(before);
  if (!m || m[1] === undefined) return null;
  return { query: m[1], start: before.length - m[1].length - 1 };
}

export function rankSlash(items: readonly SlashItem[], query: string, limit = 8): SlashItem[] {
  const order = { builtin: 0, project: 1, user: 2 };
  const sorted = [...items].sort((a, b) => order[a.source] - order[b.source]);
  return fuzzyRank(query, sorted, (i) => i.name, limit);
}

export function complete(text: string, caret: number, token: Token, insert: string) {
  const next = `${text.slice(0, token.start)}${insert}${text.slice(caret)}`;
  return { text: next, caret: token.start + insert.length };
}
