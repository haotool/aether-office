import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import {
  exitStatusOf,
  parseOutcomes,
  readOutcomes,
  resetOutcomeCache,
} from '../../apps/control/src/services/tool-outcomes.js';
import { append, toolResultLine, writeSession } from './fixtures/claude-subagents.js';

const line = (v: unknown) => `${JSON.stringify(v)}\n`;

describe('exitStatusOf (Codex tool output)', () => {
  const cases: [string, unknown, boolean | undefined][] = [
    ['JSON string with metadata.exit_code 0', '{"output":"ok","metadata":{"exit_code":0}}', true],
    ['JSON string with metadata.exit_code 1', '{"output":"no","metadata":{"exit_code":1}}', false],
    ['top-level exit_code', '{"chunk_id":"a1","exit_code":2,"output":"x"}', false],
    [
      'code-mode parts, the JSON in the second',
      [
        { type: 'input_text', text: 'Script completed\nWall time 0.2 seconds\nOutput:\n' },
        { type: 'input_text', text: '{"chunk_id":"a","exit_code":0,"output":"x"}' },
      ],
      true,
    ],
    ['text, shell tool style', 'Exit code: 0\nWall time: 0.1 seconds\nOutput:\nfine', true],
    ['text, non-zero', 'Exit code: 127\nWall time: 0.1 seconds', false],
    ['text, process style', 'Process exited with code 1\nOutput:\nboom', false],
    [
      'an exit code only nested inside another result is not read',
      '{"i":0,"result":{"exit_code":1}}',
      undefined,
    ],
    ['a null exit code (still running)', '{"exit_code":null,"status":"in_progress"}', undefined],
    [
      'a cell still running',
      'Script running with cell ID 6\nWall time 31.0 seconds\nOutput:\n',
      undefined,
    ],
    ['plain output that mentions the words', 'the test said exit_code: 0 in passing', undefined],
    ['not JSON', '{not json', undefined],
    ['empty', '', undefined],
    ['a number', 7, undefined],
  ];
  it.each(cases)('%s', (_name, output, expected) => {
    expect(exitStatusOf(output)).toBe(expected);
  });
});

describe('parseOutcomes', () => {
  it('reads Claude tool results by id whatever the key order, several to a message, skipping a cut first line', () => {
    const tail = Buffer.from(
      [
        '{"type":"user","message":{"role":"user","content":[{"type":"tool_re', // cut in half
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', content: 'x', is_error: true, tool_use_id: 'toolu_bad' },
              { tool_use_id: 'toolu_good', type: 'tool_result', content: 'y', is_error: false },
              { tool_use_id: 'toolu_silent', type: 'tool_result', content: 'no flag says nothing' },
            ],
          },
        }),
        JSON.stringify({
          type: 'assistant',
          message: { content: [{ type: 'text', text: 'mentions "tool_result" in prose' }] },
        }),
        JSON.stringify({
          type: 'user',
          message: {
            role: 'user',
            content: [
              { type: 'tool_result', tool_use_id: 'toolu_ok', content: 'z', is_error: false },
            ],
          },
        }),
      ].join('\n'),
    );
    expect([...parseOutcomes('claude', tail)]).toEqual([
      ['toolu_bad', false],
      ['toolu_good', true],
      ['toolu_ok', true],
    ]);
  });

  it('reads Codex outputs by call id, only where they carry an exit code', () => {
    const tail = Buffer.from(
      [
        line({
          type: 'response_item',
          payload: {
            type: 'function_call_output',
            call_id: 'call_1',
            output: '{"metadata":{"exit_code":0}}',
          },
        }),
        line({
          type: 'response_item',
          payload: {
            type: 'custom_tool_call_output',
            call_id: 'call_2',
            output: [{ type: 'input_text', text: '{"exit_code":3}' }],
          },
        }),
        line({
          type: 'response_item',
          payload: { type: 'function_call_output', call_id: 'call_3', output: 'no exit code here' },
        }),
        line({
          type: 'event_msg',
          payload: {
            type: 'item_completed',
            item: { aggregated_output: 'x', exit_code: 0, id: 'call_4' },
          },
        }),
      ].join(''),
    );
    expect([...parseOutcomes('codex', tail)]).toEqual([
      ['call_1', true],
      ['call_2', false],
    ]);
  });

  it('is bounded: a huge line is skipped and the map never grows without limit', () => {
    const huge = line({
      type: 'user',
      message: {
        content: [{ type: 'tool_result', tool_use_id: 'toolu_huge', content: 'x'.repeat(700_000) }],
      },
    });
    const many = Array.from({ length: 600 }, (_, i) =>
      toolResultLine(`toolu_${i}`, i % 2 === 0),
    ).join('');
    const found = parseOutcomes('claude', Buffer.from(huge + many));
    expect(found.has('toolu_huge')).toBe(false);
    expect(found.size).toBeLessThanOrEqual(400);
    expect(found.get('toolu_599')).toBe(true);
  });

  it('reads a real file through the cache and re-reads it after it changed', async () => {
    resetOutcomeCache();
    const home = await mkdtemp(join(tmpdir(), 'aether-outc-'));
    const file = await writeSession(home);
    await append(file, toolResultLine('toolu_a', true));
    expect([...(await readOutcomes('claude', file))]).toEqual([['toolu_a', false]]);
    await append(file, toolResultLine('toolu_b', false), new Date(Date.now() + 2000));
    expect((await readOutcomes('claude', file)).get('toolu_b')).toBe(true);
    expect((await readOutcomes('claude', join(home, 'missing.jsonl'))).size).toBe(0);
  });
});

describe('a session’s tool calls get their outcome from its own transcript when hooks could not say', () => {
  const hook = (provider: string, event: string, at: number, extra: object = {}) =>
    JSON.stringify({ at, provider, event, sessionId: 's', cwd: '/synthetic', ...extra });

  it('Claude: pairs by tool use id; an unmatched call stays unknown', async () => {
    const home = await mkdtemp(join(tmpdir(), 'aether-pair-'));
    const file = await writeSession(home, 's');
    await append(file, toolResultLine('toolu_fail', true) + toolResultLine('toolu_pass', false));
    const t = Date.now();
    const spool = join(home, 'spool.jsonl');
    await writeFile(
      spool,
      [
        hook('claude', 'PreToolUse', t - 3, {
          tool: 'Bash',
          toolUseId: 'toolu_fail',
          tags: ['test'],
        }),
        hook('claude', 'PreToolUse', t - 2, {
          tool: 'Bash',
          toolUseId: 'toolu_pass',
          tags: ['build'],
        }),
        hook('claude', 'PreToolUse', t - 1, {
          tool: 'Bash',
          toolUseId: 'toolu_unseen',
          tags: ['lint'],
        }),
        hook('claude', 'PreToolUse', t, { tool: 'Bash', tags: ['install'] }), // no id at all
      ].join('\n') + '\n',
    );
    resetLocalSessionCache();
    resetOutcomeCache();
    const [session] = await scanLocalSessions(home, Date.now(), 0, spool);
    expect(session!.hook!.recent.map((c) => [c.tags, c.ok])).toEqual([
      [['test'], false],
      [['build'], true],
      [['lint'], null],
      [['install'], null],
    ]);
    expect(JSON.stringify(session!.hook!.recent)).not.toContain('toolu_'); // ids stay on the server
  });

  it('Codex: pairs a rollout output with its call by call id when it carries an exit code', async () => {
    const home = await mkdtemp(join(tmpdir(), 'aether-pair-cx-'));
    const dir = join(home, '.codex/sessions/2026/10/04');
    await mkdir(dir, { recursive: true });
    const id = '01a100f1-0000-7000-8000-000000000009';
    await writeFile(
      join(dir, `rollout-t-${id}.jsonl`),
      line({ type: 'session_meta', payload: { id, cwd: home, source: 'exec' } }) +
        line({
          type: 'response_item',
          payload: {
            type: 'function_call_output',
            call_id: 'call_x',
            output: '{"metadata":{"exit_code":1}}',
          },
        }),
    );
    const t = Date.now();
    const spool = join(home, 'spool.jsonl');
    await writeFile(
      spool,
      [
        JSON.stringify({
          at: t,
          provider: 'codex',
          event: 'PreToolUse',
          sessionId: id,
          cwd: home,
          tool: 'shell',
          toolUseId: 'call_x',
          tags: ['test'],
        }),
        JSON.stringify({
          at: t,
          provider: 'codex',
          event: 'PreToolUse',
          sessionId: id,
          cwd: home,
          tool: 'shell',
          toolUseId: 'call_y',
          tags: ['build'],
        }),
      ].join('\n') + '\n',
    );
    resetLocalSessionCache();
    resetOutcomeCache();
    const [session] = await scanLocalSessions(home, Date.now(), 0, spool);
    expect(session!.hook!.recent.map((c) => [c.tags, c.ok])).toEqual([
      [['test'], false],
      [['build'], null],
    ]);
  });
});
