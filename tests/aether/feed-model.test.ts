import { expect, it } from 'vitest';
import type { Agent, AttributedSession } from '../../packages/contracts/src/index.js';
import {
  ago,
  attentionCount,
  buildFeed,
  feedItems,
  mostUrgent,
  noReplyKey,
  type Speech,
} from '../../apps/web/src/features/feed-model.js';
import { toPlainPreview } from '../../packages/kernel/src/index.js';
import { parseMarkdown } from '../../apps/web/src/features/md-parse.js';
import { parseSeen, withSeen } from '../../apps/web/src/features/session-seen.js';

const NOW = Date.parse('2026-10-06T12:00:00Z');
const MIN = 60_000;

function session(key: string, over: Partial<AttributedSession> = {}): AttributedSession {
  return {
    key,
    provider: 'claude',
    sessionId: key.split(':')[1]!,
    cwd: '/work/aether',
    repo: 'aether',
    mtime: NOW - 5 * MIN,
    git: { branch: 'main', upstream: null, ahead: 0, behind: 0, uncommitted: 0, conflicts: 0 },
    worktree: null,
    hook: null,
    subagents: [],
    title: null,
    classification: { role: 'engineer', department: 'build', confidence: 0, evidence: [] },
    usage: {
      model: null,
      contextTokens: null,
      contextWindow: null,
      contextPct: null,
      compactedAt: null,
      freshTokens: null,
      limit: null,
    },
    process: 'running',
    resources: null,
    liveness: { state: 'active', startedAt: null, quietMs: null, zombies: [] },
    ports: [],
    projectId: null,
    ...over,
  };
}
const hook = (
  activity: 'working' | 'idle' | 'waiting_permission',
  lastEvent: string,
  at = NOW - MIN,
  tool: string | null = null,
) => ({ activity, lastEvent, tool, at, recent: [] });
const agentFor = (s: AttributedSession) =>
  ({ id: `local:${s.key}`, name: s.key, species: 'fox', color: '#fff' }) as unknown as Agent;
const feedOf = (
  sessions: AttributedSession[],
  speech: Record<string, Speech> = {},
  seen: Record<string, number> = {},
) => buildFeed({ sessions, agents: sessions.map(agentFor), speech, seen, now: NOW });

it('sorts sessions into needs you, working, recently finished and idle, newest first', () => {
  const sessions = [
    session('claude:idle-old', {
      mtime: NOW - 5 * 60 * MIN,
      hook: hook('idle', 'Stop', NOW - 5 * 60 * MIN),
    }),
    session('claude:done', { hook: hook('idle', 'Stop', NOW - 3 * MIN) }),
    session('claude:work-old', { hook: hook('working', 'PreToolUse', NOW - 4 * MIN, 'Bash') }),
    session('claude:work-new', { hook: hook('working', 'PreToolUse', NOW - MIN, 'Edit') }),
    session('claude:perm', { hook: hook('waiting_permission', 'PermissionRequest') }),
    session('claude:ask', { hook: hook('waiting_permission', 'Notification') }),
    session('claude:gone', { process: 'none', mtime: NOW - 3 * 60 * MIN, hook: null }),
  ];
  const feed = feedOf(sessions);
  expect(feed.needs.map((i) => [i.key, i.reason])).toEqual([
    ['claude:perm', 'permission'],
    ['claude:ask', 'attention'],
  ]);
  expect(feed.working.map((i) => i.key)).toEqual(['claude:work-new', 'claude:work-old']);
  expect(feed.finished.map((i) => i.key)).toEqual(['claude:done']);
  expect(feed.idle.map((i) => [i.key, i.stale])).toEqual([['claude:idle-old', true]]);
  expect(feedItems(feed)[0]!.key).toBe('claude:perm');
  expect(mostUrgent(feed)!.key).toBe('claude:perm');
  expect(feed.working[0]!.tool).toBe('Edit');
});

it('marks needs-you and finished rows unread until they were opened after their latest activity', () => {
  const sessions = [
    session('claude:a', { hook: hook('idle', 'Stop', NOW - 3 * MIN) }),
    session('claude:b', { hook: hook('idle', 'Stop', NOW - 3 * MIN) }),
    session('claude:c', { hook: hook('working', 'PreToolUse', NOW - MIN) }),
  ];
  const feed = feedOf(sessions, {}, { 'claude:a': NOW - MIN });
  expect(feed.finished.map((i) => [i.key, i.unread])).toEqual([
    ['claude:a', false],
    ['claude:b', true],
  ]);
  expect(feed.working[0]!.unread).toBe(false); // working rows carry no dot
  expect(attentionCount(feed)).toBe(1);
  // A reply newer than the last visit makes it unread again.
  const speech = { 'claude:a': { user: null, assistant: { text: 'new', at: NOW - 30_000 } } };
  expect(
    feedOf(sessions, speech, { 'claude:a': NOW - MIN }).finished.find((i) => i.key === 'claude:a')!
      .unread,
  ).toBe(true);
});

it('shows the newest reply as plain text and the title and place of each session', () => {
  const s = session('claude:t', { title: 'Fix login', hook: hook('idle', 'Stop') });
  const [item] = feedItems(
    feedOf([s], {
      'claude:t': {
        user: null,
        assistant: { text: '## Done\n\n- **fixed** `login.ts`\n```ts\nx\n```', at: NOW - 2 * MIN },
      },
    }),
  );
  expect(item!.reply).toBe('Done · fixed login.ts · ‹x›');
  expect(item!.label).toBe('Fix login');
  expect(item!.where).toBe('aether · main');
  expect(toPlainPreview('see [the docs](https://x.y) now')).toBe('see the docs now');
});

it('says "No reply yet" only once the replies are known, and only for a running session', () => {
  const s = session('claude:r', { hook: hook('working', 'PreToolUse') });
  const row = (speech: Record<string, Speech> | undefined) =>
    feedItems(buildFeed({ sessions: [s], agents: [agentFor(s)], speech, seen: {}, now: NOW }))[0]!;
  expect(noReplyKey(row(undefined))).toBe('feedReplyNotLoaded');
  expect(noReplyKey(row({}))).toBe('feedNoReply');
  expect(noReplyKey({ ...row({}), session: { ...s, process: 'none' } })).toBe('feedReplyNotLoaded');
});

it('says how long ago in both languages', () => {
  expect(ago(20_000, 'en')).toBe('now');
  expect(ago(20_000, 'zh-TW')).toBe('剛剛');
  expect(ago(3 * MIN, 'en')).toBe('3 min ago');
  expect(ago(3 * MIN, 'zh-TW')).toBe('3 分鐘前');
});

it('remembers when a session was opened, never backwards, and ignores garbage in storage', () => {
  const once = withSeen({}, 'k', 10);
  expect(withSeen(once, 'k', 5)).toBe(once);
  expect(withSeen(once, 'k', 20)).toEqual({ k: 20 });
  let many = {};
  for (let i = 0; i < 230; i++) many = withSeen(many, `k${i}`, i + 1);
  expect(Object.keys(many)).toHaveLength(200);
  expect(many).not.toHaveProperty('k0');
  expect(parseSeen('{"a":1,"b":"x","c":null}')).toEqual({ a: 1 });
  expect(parseSeen('not json')).toEqual({});
  expect(parseSeen('[1]')).toEqual({});
  expect(parseSeen(null)).toEqual({});
});

it('parses the Markdown an agent writes into data, never into HTML', () => {
  const blocks = parseMarkdown(
    'Intro with `code` and **bold** and *soft*.\n\n- one\n- two\n\n1. first\n\n## Title\n```sh\nls -la\n\nmore\n```\n<script>alert(1)</script>',
  );
  expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'list', 'list', 'heading', 'code']); // the trailing <script> element is dropped with its content, so it is no block at all
  const [intro, bullets, numbered, , code] = blocks;
  expect(intro).toMatchObject({
    inline: [
      { text: 'Intro with ' },
      { text: 'code', code: true },
      { text: ' and ' },
      { text: 'bold', bold: true },
      { text: ' and ' },
      { text: 'soft', italic: true },
      { text: '.' },
    ],
  });
  expect(bullets).toMatchObject({
    ordered: false,
    items: [
      { blocks: [{ inline: [{ text: 'one' }] }] },
      { blocks: [{ inline: [{ text: 'two' }] }] },
    ],
  });
  expect(numbered).toMatchObject({ ordered: true });
  expect(code).toEqual({ type: 'code', text: 'ls -la\n\nmore', lang: 'sh' });
  expect(JSON.stringify(blocks)).not.toContain('script');
});
