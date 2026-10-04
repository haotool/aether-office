import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import {
  claudeTopic,
  codexTopic,
  topicTitle,
} from '../../apps/control/src/services/session-topic.js';

it('finds the task in Claude’s last-prompt and in the first real user message of a Codex rollout', () => {
  expect(
    claudeTopic(
      ['{"cut', JSON.stringify({ type: 'last-prompt', lastPrompt: 'Add   a REST\nendpoint' })].join(
        '\n',
      ),
    ),
  ).toBe('Add a REST endpoint');
  const user = (text: string) =>
    JSON.stringify({
      type: 'response_item',
      payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text }] },
    });
  expect(
    codexTopic(
      [
        JSON.stringify({ type: 'session_meta', payload: { cwd: '/x' } }),
        user('<environment_context>cwd</environment_context>'),
        user('# AGENTS.md instructions for /x'),
        user('Review the billing service for security issues'),
      ].join('\n'),
    ),
  ).toBe('Review the billing service for security issues');
  expect(codexTopic('')).toBeNull();
  expect(claudeTopic('{"type":"user"}')).toBeNull();
});

it('classifies a session by what it was asked to do without sending that text to the client', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-topic-'));
  const dir = join(home, '.claude/projects/-p');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'sess-1.jsonl'),
    [
      JSON.stringify({ type: 'user', cwd: home }),
      JSON.stringify({
        type: 'last-prompt',
        lastPrompt: 'fix the flaky playwright test SECRETWORD',
      }),
    ].join('\n') + '\n',
  );
  resetLocalSessionCache();
  const [session] = await scanLocalSessions(home, Date.now(), 0, join(home, 'none.jsonl'));
  expect(session!.classification).toMatchObject({
    role: 'qa',
    department: 'quality',
    basis: 'prompt',
  });
  expect(JSON.stringify(session)).not.toContain('SECRETWORD');
});

describe('topicTitle', () => {
  it('cuts the opening words short and strips credentials', () => {
    expect(topicTitle(null)).toBeNull();
    expect(topicTitle('你是唯讀審查員。PR #1150 第六輪')).toBe('你是唯讀審查員。PR #1150 第六輪');
    expect(topicTitle('x'.repeat(100))).toBe(`${'x'.repeat(80)}…`);
    expect(topicTitle('use sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789 now')).not.toContain(
      'abcdefghijklmnop',
    );
  });
});

it('titles an unnamed codex exec run by the opening words of its task', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-topic-'));
  const dir = join(home, '.codex/sessions/2026/10/04');
  await mkdir(dir, { recursive: true });
  const id = '01a10229-245e-7473-a007-2bdd72b62745';
  await writeFile(
    join(dir, `rollout-2026-10-04T10-00-00-${id}.jsonl`),
    [
      { type: 'session_meta', payload: { id, cwd: home, source: 'exec' } },
      {
        type: 'response_item',
        payload: { type: 'message', role: 'user', content: [{ text: '# AGENTS.md instructions' }] },
      },
      {
        type: 'response_item',
        payload: {
          type: 'message',
          role: 'user',
          content: [{ text: '你是唯讀審查員。PR #1150 第六輪' }],
        },
      },
    ]
      .map((e) => JSON.stringify(e))
      .join('\n') + '\n',
  );
  resetLocalSessionCache();
  const [session] = await scanLocalSessions(home, Date.now(), 0, join(home, 'none.jsonl'));
  expect(session!.title).toBe('你是唯讀審查員。PR #1150 第六輪');
});
