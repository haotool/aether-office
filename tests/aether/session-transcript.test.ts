import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/local-sessions.js';
import { redactSecrets } from '../../apps/control/src/services/redaction.js';
import { parseTranscript } from '../../apps/control/src/services/session-transcript.js';
import { fixture } from './fixture.js';

const line = (v: unknown) => JSON.stringify(v);

it('redacts credentials but keeps paths and prose', () => {
  const text = redactSecrets(
    'push with ghp_abcdefghijklmnopqrstuvwxyz0123 to https://bob:hunter2@example.com, api_key=XYZ123 and Bearer abcdefghijklmnopqrstuvwxyz in /repo/src/app.ts',
  );
  expect(text).not.toMatch(/ghp_abc|hunter2|XYZ123|abcdefghijklmnopqrstuvwxyz/);
  expect(text).toContain('/repo/src/app.ts');
  expect(text).toContain('push with');
});

it('reads a Claude transcript: messages, tools and results, never thinking, never injected context', () => {
  const tail = [
    '{"cut',
    line({
      type: 'user',
      timestamp: '2026-10-04T10:00:00Z',
      message: { role: 'user', content: '<system-reminder>injected</system-reminder>' },
    }),
    line({
      type: 'user',
      timestamp: '2026-10-04T10:00:01Z',
      message: { role: 'user', content: 'Fix the login bug' },
    }),
    line({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'PRIVATE REASONING' },
          { type: 'text', text: 'Looking at it now.' },
          {
            type: 'tool_use',
            name: 'Edit',
            input: { file_path: '/repo/src/login.ts', old_string: 'a', new_string: 'b' },
          },
          { type: 'tool_use', name: 'Bash', input: { command: 'pnpm test -- login' } },
        ],
      },
    }),
    line({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', content: 'tests failed', is_error: true }],
      },
    }),
  ].join('\n');
  const { entries, analysis } = parseTranscript('claude', tail);
  expect(entries.map((e) => e.role)).toEqual(['user', 'assistant', 'tool', 'tool', 'result']);
  expect(JSON.stringify(entries)).not.toContain('PRIVATE REASONING');
  expect(JSON.stringify(entries)).not.toContain('injected');
  expect(entries[4]!.error).toBe(true);
  expect(analysis.tools).toEqual([
    { name: 'Edit', count: 1 },
    { name: 'Bash', count: 1 },
  ]);
  expect(analysis.commands).toEqual(['pnpm test -- login']);
  expect(analysis.files).toEqual(['/repo/src/login.ts']);
});

it('reads a Codex transcript: messages, function calls with patches and outputs, never reasoning', () => {
  const tail = [
    line({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'user',
        content: [
          { type: 'input_text', text: '<environment_context>x</environment_context>' },
          { type: 'input_text', text: 'Review the diff' },
        ],
      },
    }),
    line({ type: 'response_item', payload: { type: 'reasoning', summary: [{ text: 'PRIVATE' }] } }),
    line({
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        arguments: JSON.stringify({ cmd: 'git diff --stat' }),
      },
    }),
    line({
      type: 'response_item',
      payload: {
        type: 'custom_tool_call',
        name: 'apply_patch',
        input: '*** Begin Patch\n*** Update File: src/a.ts\n@@\n',
      },
    }),
    line({ type: 'response_item', payload: { type: 'function_call_output', output: 'ok' } }),
    line({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: 'Done.' }],
      },
    }),
  ].join('\n');
  const { entries, analysis } = parseTranscript('codex', tail);
  expect(entries.map((e) => e.role)).toEqual(['user', 'tool', 'tool', 'result', 'assistant']);
  expect(JSON.stringify(entries)).not.toContain('PRIVATE');
  expect(analysis.commands).toEqual(['git diff --stat']);
  expect(analysis.files).toEqual(['src/a.ts']);
});

it('pairs a tool call with its result by id and gives each call a short, redacted target', () => {
  const claude = [
    line({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          { type: 'tool_use', id: 'toolu_1', name: 'Read', input: { file_path: '/repo/src/a.ts' } },
          {
            type: 'tool_use',
            id: 'toolu_2',
            name: 'Bash',
            input: { command: 'curl -H "Authorization: Bearer abcdefghijklmnopqrstuvwxyz" x' },
          },
        ],
      },
    }),
    line({
      type: 'user',
      message: {
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'file text' }],
      },
    }),
  ].join('\n');
  const { entries } = parseTranscript('claude', claude);
  expect(entries.map((e) => [e.toolId, e.summary])).toEqual([
    ['toolu_1', '/repo/src/a.ts'],
    ['toolu_2', expect.stringContaining('curl')],
    ['toolu_1', null],
  ]);
  expect(JSON.stringify(entries)).not.toContain('abcdefghijklmnopqrstuvwxyz');
  const codex = [
    line({
      type: 'response_item',
      payload: {
        type: 'function_call',
        name: 'exec_command',
        call_id: 'call_7',
        arguments: JSON.stringify({ cmd: 'ls -la' }),
      },
    }),
    line({
      type: 'response_item',
      payload: { type: 'function_call_output', call_id: 'call_7', output: 'clean' },
    }),
  ].join('\n');
  const parsed = parseTranscript('codex', codex).entries;
  expect(parsed.map((e) => [e.toolId, e.summary])).toEqual([
    ['call_7', 'ls -la'],
    ['call_7', null],
  ]);
});

it('serves a transcript only to an owner, only by a key the scanner found, never by a path', async () => {
  const home = await mkdtemp(join(tmpdir(), 'aether-transcript-'));
  const dir = join(home, '.claude/projects/-p');
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'sess-9.jsonl'),
    [
      line({
        type: 'user',
        cwd: home,
        message: { role: 'user', content: 'hello api_key=SECRETVALUE' },
      }),
    ].join('\n') + '\n',
  );
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = home;
  resetLocalSessionCache();
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4502' });
  try {
    const get = (url: string, token: string) =>
      app.inject({
        method: 'GET',
        url,
        headers: { host: '127.0.0.1:4502', authorization: `Bearer ${token}` },
      });
    expect((await get('/api/local-sessions', f.owner.token)).statusCode).toBe(200); // the scan registers the key
    const ok = await get('/api/local-sessions/claude:sess-9/transcript', f.owner.token);
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain('hello');
    expect(ok.body).not.toContain('SECRETVALUE');
    expect(
      (await get('/api/local-sessions/claude:sess-9/transcript', f.sender.token)).statusCode,
    ).toBe(403);
    expect(
      (await get('/api/local-sessions/claude:unknown/transcript', f.owner.token)).statusCode,
    ).toBe(404);
    expect(
      (
        await get(
          `/api/local-sessions/${encodeURIComponent('claude:../../etc/passwd')}/transcript`,
          f.owner.token,
        )
      ).statusCode,
    ).toBe(400);
  } finally {
    delete process.env['AETHER_LOCAL_SESSIONS_HOME'];
    await app.close();
    f.control.close();
  }
});
