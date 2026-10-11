import { expect, it } from 'vitest';
import {
  anchorOf,
  groupSpanMs,
  groupTurns,
  kindOf,
  newMessagesSince,
  shortDuration,
  shortTarget,
  toolSummaryText,
  type Entry,
} from '../../apps/web/src/features/conversation/turn-groups.js';

const e = (role: Entry['role'], text: string, extra: Partial<Entry> = {}): Entry => ({
  at: null,
  role,
  name: null,
  text,
  error: false,
  toolId: null,
  summary: null,
  ...extra,
});
const call = (name: string, id: string | null, summary: string | null = null) =>
  e('tool', '{}', { name, toolId: id, summary });

it('groups a transcript into turns and folds consecutive tool calls, pairing results by id', () => {
  const turns = groupTurns([
    e('user', 'fix it', { at: 1 }),
    e('assistant', 'Looking.'),
    call('Read', 'a', '/x.ts'),
    call('Read', 'b', '/y.ts'),
    e('result', 'text of y', { toolId: 'b' }),
    e('result', 'text of x', { toolId: 'a' }),
    call('Edit', 'c', '/x.ts'),
    e('result', 'denied', { toolId: 'c', error: true }),
    e('assistant', 'Done.'),
    e('user', 'thanks', { at: 2 }),
  ]);
  expect(turns).toHaveLength(2);
  const [first, second] = turns;
  expect(first!.user?.text).toBe('fix it');
  expect(first!.blocks.map((b) => b.type)).toEqual(['assistant', 'tools', 'assistant']);
  const tools = first!.blocks[1]!;
  if (tools.type !== 'tools') throw new Error('expected a tool group');
  expect(tools.calls.map((c) => [c.name, c.result?.text])).toEqual([
    ['Read', 'text of x'],
    ['Read', 'text of y'],
    ['Edit', 'denied'],
  ]);
  expect(tools.calls[2]!.result?.error).toBe(true);
  expect(second!.blocks).toEqual([]);
});

it('pairs results without ids in order, leaves an unanswered call running, drops an orphan result', () => {
  const turns = groupTurns([
    e('result', 'orphan from before the tail'),
    call('exec_command', null),
    e('result', 'ok'),
    call('exec_command', null),
  ]);
  expect(turns).toHaveLength(1);
  expect(turns[0]!.user).toBeNull();
  const block = turns[0]!.blocks[0]!;
  if (block.type !== 'tools') throw new Error('expected a tool group');
  expect(block.calls.map((c) => c.result?.text ?? null)).toEqual(['ok', null]);
});

it('says what a group did in a few words, in both languages', () => {
  const calls = groupTurns([
    call('Read', '1'),
    call('Grep', '2'),
    call('Glob', '3'),
    call('Read', '4'),
    call('Edit', '5'),
    call('MultiEdit', '6'),
    call('Bash', '7'),
  ]).flatMap((t) => t.blocks.flatMap((b) => (b.type === 'tools' ? b.calls : [])));
  expect(toolSummaryText(calls, 'en')).toBe('read 4 files · edited 2 · ran 1 command');
  expect(toolSummaryText(calls, 'zh-TW')).toBe('讀取 4 次 · 編輯 2 次 · 執行 1 個指令');
  expect(['Read', 'apply_patch', 'exec_command', 'mcp__x'].map(kindOf)).toEqual([
    'read',
    'edit',
    'run',
    'other',
  ]);
});

it('shortens a long path from the front and leaves commands and short paths alone', () => {
  expect(shortTarget('/private/var/folders/xx/repos/aether/apps/web/a.ts')).toBe('…/apps/web/a.ts');
  expect(shortTarget('/a/b/c')).toBe('/a/b/c');
  expect(shortTarget('pnpm test -- /a/b/c/d/e')).toBe('pnpm test -- /a/b/c/d/e');
});

it('counts the messages that arrived after an anchor, not tool traffic', () => {
  const before = [e('user', 'a', { at: 1 }), e('assistant', 'b', { at: 2 })];
  const anchor = anchorOf(before);
  const after = [
    ...before,
    call('Read', 'x'),
    e('assistant', 'c', { at: 3 }),
    e('user', 'd', { at: 4 }),
  ];
  expect(newMessagesSince(after, anchor)).toBe(2);
  expect(newMessagesSince(before, anchor)).toBe(0);
  expect(newMessagesSince(after.slice(3), anchor)).toBe(2);
  expect(newMessagesSince(after, null)).toBe(4);
});

it('times a group of calls: first call to last result, to now while one still runs', () => {
  const [turn] = groupTurns([
    e('user', 'go', { at: 1000 }),
    call('Read', 'a', '/x.ts'),
    e('result', 'ok', { toolId: 'a' }),
  ]);
  const block = turn!.blocks[0];
  if (block?.type !== 'tools') throw new Error('expected a tool group');
  expect(groupSpanMs(block.calls, 9000)).toBeNull();
  const timed = groupTurns([
    call('Read', 'a', '/x.ts'),
    call('Bash', 'b', 'ls'),
    e('result', 'ok', { toolId: 'a' }),
  ]).flatMap((t) => t.blocks);
  const calls = (timed[0] as { calls: Parameters<typeof groupSpanMs>[0] }).calls.map((c, i) => ({
    ...c,
    at: 1000 + i * 500,
    result: c.result ? { ...c.result, at: 3000 } : null,
  }));
  expect(groupSpanMs(calls, 9000)).toBe(8000);
  expect(groupSpanMs([calls[0]!], 9000)).toBe(2000);
});

it('shows a duration at a glance', () => {
  expect(shortDuration(200)).toBe('1s');
  expect(shortDuration(8400)).toBe('8s');
  expect(shortDuration(125_000)).toBe('2m 05s');
});

it('puts notices in the current turn without opening one, and joins a run of them', () => {
  const turns = groupTurns([
    e('notice', '', { notice: { kind: 'context', label: 'system', text: 'a' } }),
    e('user', 'go', { at: 1000 }),
    e('notice', '', { notice: { kind: 'command', name: '/compact', args: '' } }),
    e('notice', '', { notice: { kind: 'interrupted' } }),
    e('assistant', 'done'),
    e('notice', '', { notice: null }),
  ]);
  expect(turns.map((t) => [t.user?.text ?? null, t.blocks.map((b) => b.type)])).toEqual([
    [null, ['notices']],
    ['go', ['notices', 'assistant']],
  ]);
  const second = turns[1]!.blocks[0];
  expect(second?.type === 'notices' && second.items.map((n) => n.kind)).toEqual([
    'command',
    'interrupted',
  ]);
});

it('does not count a notice as a new message', () => {
  const entries = [
    e('user', 'a', { at: 1 }),
    e('notice', '', { at: 2, notice: { kind: 'interrupted' } }),
  ];
  expect(newMessagesSince(entries, anchorOf(entries.slice(0, 1)))).toBe(0);
});
