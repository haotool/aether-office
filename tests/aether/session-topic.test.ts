import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import { claudeTopic, codexTopic } from '../../apps/control/src/services/session-topic.js';

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
