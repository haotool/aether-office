import { expect, it } from 'vitest';
import {
  CLEAR_LINE,
  ENTER_DELAY_MS,
  MAX_BODY,
  MAX_QUEUE,
  atPrompt,
  atToken,
  canSend,
  complete,
  effortCommand,
  enqueue,
  isAwaitingReply,
  isUnconfirmed,
  modelCommand,
  nextQueued,
  rankSlash,
  sanitizeBody,
  seenIn,
  sequenceFor,
  slashToken,
  type Pending,
  type SlashItem,
} from '../../apps/web/src/features/conversation/composer-model.js';
import {
  BUILTIN_COMMANDS,
  slashItems,
} from '../../apps/web/src/features/conversation/slash-commands.js';
import { fuzzyScore } from '../../packages/kernel/src/index.js';

const pending = (localId: string, text: string, over: Partial<Pending> = {}): Pending => ({
  localId,
  text,
  at: 1_000_000,
  state: 'sent',
  ...over,
});

it('delivers a message as: clear the line, the body, Enter a moment later', () => {
  expect(sequenceFor('fix the bug')).toEqual([
    { text: CLEAR_LINE, delayMs: 0 },
    { text: 'fix the bug', delayMs: 0 },
    { text: '\r', delayMs: ENTER_DELAY_MS },
  ]);
  expect(sequenceFor('   \n ')).toEqual([]);
});

it('wraps several lines in one paste, so a newline is not an Enter, and cannot be broken out of', () => {
  const steps = sequenceFor('one\ntwo\r\nthree');
  expect(steps[1]!.text).toBe('\x1b[200~one\ntwo\nthree\x1b[201~');
  const hostile = sequenceFor('a\n\x1b[201~rm -rf\x03b');
  expect(hostile[1]!.text).toBe('\x1b[200~a\n[201~rm -rfb\x1b[201~');
  expect(sanitizeBody('a\tb\x07\x7f')).toBe('a\tb');
  expect(sanitizeBody('x'.repeat(MAX_BODY + 50))).toHaveLength(MAX_BODY);
});

it('keeps a bounded queue, oldest first, and sends only when it can', () => {
  let list: Pending[] = [];
  for (let i = 0; i < MAX_QUEUE; i++)
    list = enqueue(list, pending(`q${i}`, `m${i}`, { state: 'queued' }))!;
  expect(enqueue(list, pending('over', 'x', { state: 'queued' }))).toBeNull();
  expect(nextQueued(list)?.localId).toBe('q0');
  expect(
    enqueue([...list.slice(1), pending('s', 's')], pending('ok', 'x', { state: 'queued' })),
  ).not.toBeNull();
  const gate = { online: true, free: true, atPrompt: true, working: false, holdUntil: 0, now: 10 };
  expect(canSend(gate)).toBe(true);
  expect(canSend({ ...gate, online: false })).toBe(false);
  expect(canSend({ ...gate, free: false })).toBe(false);
  expect(canSend({ ...gate, atPrompt: false })).toBe(false);
  expect(canSend({ ...gate, working: true })).toBe(false);
  expect(canSend({ ...gate, holdUntil: 11 })).toBe(false);
});

it('holds a message while the terminal shows a menu or question instead of its prompt', () => {
  expect(atPrompt('idle')).toBe(true);
  expect(atPrompt('working')).toBe(true);
  expect(atPrompt(null)).toBe(true);
  expect(atPrompt('waiting')).toBe(false);
  expect(atPrompt('unknown')).toBe(false);
});

it('is awaiting a reply while a message is being sent or sent but not yet in the transcript', () => {
  const now = 1_000_000 + 5_000;
  expect(isAwaitingReply([], now)).toBe(false);
  expect(isAwaitingReply([pending('a', 'x', { state: 'queued' })], now)).toBe(false);
  expect(isAwaitingReply([pending('a', 'x', { state: 'failed' })], now)).toBe(false);
  expect(isAwaitingReply([pending('a', 'x', { state: 'sending' })], now)).toBe(true);
  expect(isAwaitingReply([pending('a', 'x', { state: 'sent' })], now)).toBe(true);
});

it('stops awaiting a message the transcript never showed', () => {
  const lost = [pending('a', 'x', { state: 'sent' })];
  expect(isAwaitingReply(lost, 1_000_000 + 89_000)).toBe(true);
  expect(isAwaitingReply(lost, 1_000_000 + 91_000)).toBe(false);
});

it('matches a sent message to the transcript prompt once, by text, and flags one never seen', () => {
  const sent = [pending('a', 'fix  the bug'), pending('b', 'fix the bug'), pending('c', 'later')];
  const prompts = [
    { text: 'fix the bug', at: 1_000_500 },
    { text: 'something else', at: 1_000_600 },
  ];
  expect([...seenIn(sent, prompts)]).toEqual(['a']);
  expect([...seenIn(sent, [...prompts, { text: 'fix the bug', at: 1_000_900 }])]).toEqual([
    'a',
    'b',
  ]);
  expect(seenIn([pending('a', 'hi')], [{ text: 'hi', at: 1_000_000 - 3_600_000 }]).size).toBe(0);
  expect(seenIn([pending('q', 'hi', { state: 'queued' })], [{ text: 'hi', at: null }]).size).toBe(
    0,
  );
  expect(isUnconfirmed(pending('a', 'x'), 1_000_000 + 91_000)).toBe(true);
  expect(isUnconfirmed(pending('a', 'x'), 1_000_000 + 5_000)).toBe(false);
});

it('sends the CLI own command for a model, and only claims what has one', () => {
  expect(modelCommand('claude', 'opus')).toBe('/model opus');
  expect(modelCommand('claude', 'claude-opus-4-5')).toBe('/model claude-opus-4-5');
  expect(modelCommand('claude', 'opus[1m]')).toBe('/model opus[1m]');
  expect(modelCommand('claude', 'x; rm')).toBeNull();
  expect(modelCommand('codex', 'gpt-5')).toBe('/model');
  expect(effortCommand('claude', 'high')).toBe('/effort high');
  expect(effortCommand('codex', 'high')).toBeNull();
  expect(effortCommand('claude', 'high; x')).toBeNull();
});

it('finds the slash and @ word being typed', () => {
  expect(slashToken('/co', 3)).toEqual({ query: 'co', start: 0 });
  expect(slashToken('/', 1)).toEqual({ query: '', start: 0 });
  expect(slashToken('hello /co', 9)).toBeNull();
  expect(slashToken('/model opus', 11)).toBeNull();
  expect(atToken('look at @src/up', 15)).toEqual({ query: 'src/up', start: 8 });
  expect(atToken('@a', 2)).toEqual({ query: 'a', start: 0 });
  expect(atToken('mail me@host', 12)).toBeNull();
  const token = atToken('see @sr and more', 7)!;
  expect(complete('see @sr and more', 7, token, '@src/a.ts ')).toEqual({
    text: 'see @src/a.ts  and more',
    caret: 14,
  });
});

const item = (name: string, source: SlashItem['source'] = 'builtin'): SlashItem => ({
  id: `${source}:${name}`,
  name,
  description: name,
  source,
  kind: 'text',
});

it('ranks slash commands fuzzily: prefix before scatter, builtin before custom on a tie, bounded', () => {
  const items = [
    item('review-pr', 'project'),
    item('review'),
    item('compact'),
    item('cost'),
    item('config'),
  ];
  expect(rankSlash(items, 'rev').map((i) => i.id)).toEqual(['builtin:review', 'project:review-pr']);
  expect(rankSlash(items, 'cmp').map((i) => i.name)).toEqual(['compact']);
  expect(rankSlash(items, 'zzz')).toEqual([]);
  expect(rankSlash(items, '', 3)).toHaveLength(3);
  expect(fuzzyScore('abc', 'a-b-c')!).toBeGreaterThan(fuzzyScore('abc', 'axxbxxc')!);
  expect(fuzzyScore('co', 'compact')!).toBeGreaterThan(fuzzyScore('co', 'xxcxo')!);
});

it('builds the menu from the built-in commands of the provider and the custom ones, deduplicated', () => {
  const custom = [
    { name: 'review', description: 'mine', source: 'project' as const, kind: 'command' as const },
    { name: 'deploy', description: 'Deploy', source: 'user' as const, kind: 'skill' as const },
  ];
  const claude = slashItems('claude', custom);
  expect(claude.map((i) => i.name)).toContain('compact');
  expect(claude.filter((i) => i.name === 'review')).toHaveLength(1);
  expect(claude.find((i) => i.name === 'deploy')?.kind).toBe('skill');
  expect(slashItems('codex', custom).some((i) => i.name === 'deploy')).toBe(true);
  expect(BUILTIN_COMMANDS.claude.find((c) => c.name === 'model')?.kind).toBe('picker');
  expect(BUILTIN_COMMANDS.claude.find((c) => c.name === 'compact')?.kind).toBe('text');
  expect(BUILTIN_COMMANDS.codex.find((c) => c.name === 'compact')).toBeTruthy();
});
