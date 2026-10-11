import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { resetLocalSessionCache } from '../../apps/control/src/services/runtime/local-sessions.js';
import { redactSecrets } from '../../apps/control/src/services/platform/redaction.js';
import { parseTranscript } from '../../apps/control/src/services/sessions/session-transcript.js';
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
  expect(entries.map((e) => e.role)).toEqual([
    'notice',
    'user',
    'assistant',
    'tool',
    'tool',
    'result',
  ]);
  expect(JSON.stringify(entries)).not.toContain('PRIVATE REASONING');
  expect(entries[0]!.notice).toEqual({ kind: 'context', label: 'system', text: 'injected' });
  expect(entries[0]!.text).toBe('');
  expect(entries[5]!.error).toBe(true);
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
  expect(entries.map((e) => e.role)).toEqual([
    'notice',
    'user',
    'tool',
    'tool',
    'result',
    'assistant',
  ]);
  expect(entries[0]!.notice).toMatchObject({ kind: 'context', label: 'environment' });
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
    expect((await get('/api/local-sessions', f.owner.token)).statusCode).toBe(200);
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

it('sanitizes HTML and CLI wrappers in messages before they leave the server', () => {
  const span =
    '<span class="tx">confirm-rate 的有效設定除了 decision off→on，也包含 R4 false→true。</span>';
  const tail = [
    line({
      type: 'assistant',
      message: {
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: `${span}<br>Array<string> and a < b &amp; <a href="https://x.dev">docs</a>`,
          },
        ],
      },
    }),
    line({
      type: 'user',
      message: {
        role: 'user',
        content:
          '<command-name>/compact</command-name><command-message>compact</command-message><command-args></command-args>',
      },
    }),
    line({
      type: 'user',
      message: {
        role: 'user',
        content: '<local-command-caveat>do not answer</local-command-caveat>',
      },
    }),
    line({
      type: 'user',
      message: { role: 'user', content: 'note <thinking>private</thinking>to self' },
    }),
  ].join('\n');
  const { entries } = parseTranscript('claude', tail);
  expect(entries.map((e) => e.text)).toEqual([
    'confirm-rate 的有效設定除了 decision off→on，也包含 R4 false→true。\nArray<string> and a < b & [docs](https://x.dev)',
    '',
    'note to self',
  ]);
  expect(entries[1]!.notice).toEqual({ kind: 'command', name: '/compact', args: '' });
});

const TASK_BLOCK =
  '<task-notification>\n<task-id>b3k9x2</task-id>\n<tool-use-id>toolu_01X</tool-use-id>\n<output-file>/tmp/t/b3k9x2.output</output-file>\n<status>completed</status>\n<summary>Background command "pnpm test" completed (exit code 0)</summary>\n</task-notification>';

it('turns wrappers into typed, redacted notices and never leaks their tags, ids or paths', () => {
  const tail = [
    line({ type: 'user', message: { role: 'user', content: TASK_BLOCK } }),
    line({
      type: 'user',
      message: {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '<system-reminder>token=SUPERSECRETVALUE1234 be careful</system-reminder>Go on</div>',
          },
        ],
      },
    }),
    line({ type: 'user', message: { role: 'user', content: '[Request interrupted by user]' } }),
    line({
      type: 'user',
      message: {
        role: 'user',
        content: '<local-command-stdout>Compacted \u001b[1mok\u001b[0m</local-command-stdout>',
      },
    }),
  ].join('\n');
  const { entries, analysis } = parseTranscript('claude', tail);
  expect(entries.map((e) => [e.role, e.notice?.kind ?? null, e.text])).toEqual([
    ['notice', 'task', ''],
    ['notice', 'context', ''],
    ['user', null, 'Go on'],
    ['notice', 'interrupted', ''],
    ['notice', 'output', ''],
  ]);
  expect(entries[0]!.notice).toMatchObject({
    status: 'completed',
    exitCode: 0,
    summary: 'Background command "pnpm test" completed (exit code 0)',
  });
  const json = JSON.stringify(entries);
  expect(json).not.toMatch(/b3k9x2|toolu_01X|\/tmp\/t|SUPERSECRETVALUE1234|<\/?[a-z-]+>|\u001b/);
  expect(analysis.messages).toEqual({ user: 1, assistant: 0 });
});

it('sanitizes a Codex message the same way', () => {
  const tail = line({
    type: 'response_item',
    payload: {
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: '<div><b>done</b>&nbsp;<code>x &lt; y</code></div>' }],
    },
  });
  expect(parseTranscript('codex', tail).entries[0]!.text).toBe('**done** `x < y`');
});
