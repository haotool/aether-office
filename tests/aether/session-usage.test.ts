import { expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseUsage, readUsage } from '../../apps/control/src/services/session-usage.js';
import { fresh, newState } from '../../apps/control/src/services/usage-counters.js';
import { dayKeyOf, parseChunk } from '../../apps/control/src/services/usage-parse.js';

const line = (value: unknown) => JSON.stringify(value);

it('reads Codex context in use, session total, window and the model of the latest turn', () => {
  const tail = [
    '{"cut-off first li',
    line({ type: 'turn_context', payload: { model: 'gpt-old' } }),
    line({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 10 },
          total_token_usage: { total_tokens: 20 },
          model_context_window: 100,
        },
      },
    }),
    line({ type: 'turn_context', payload: { model: 'gpt-new', cwd: '/secret/project' } }),
    line({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: {
          last_token_usage: { input_tokens: 500 },
          total_token_usage: { total_tokens: 900, cached_input_tokens: 600 },
          model_context_window: 1000,
        },
      },
    }),
    line({
      type: 'event_msg',
      payload: {
        type: 'token_count',
        info: null,
        rate_limits: {
          primary: { used_percent: 84, window_minutes: 10080, resets_at: 1791583205 },
          plan_type: 'prolite',
        },
      },
    }), // a rate-limit-only refresh
    line({ type: 'response_item', payload: { type: 'message', content: 'PRIVATE PROMPT TEXT' } }),
  ].join('\n');
  const usage = parseUsage('codex', Buffer.from(tail));
  expect(usage).toEqual({
    model: 'gpt-new',
    contextTokens: 500,
    contextWindow: 1000,
    contextPct: null,
    compactedAt: null,
    freshTokens: 300, // 900 in all, of which 600 came from the cache
    limit: { usedPercent: 84, windowMinutes: 10080, resetsAt: 1791583205000, plan: 'prolite' },
  });
  expect(JSON.stringify(usage)).not.toContain('PRIVATE');
});

it('reads Claude context as new plus cached input of the latest assistant message', () => {
  const tail = [
    line({ message: { model: 'claude-old', usage: { input_tokens: 1 } } }),
    line({ type: 'user', message: { content: 'PRIVATE PROMPT TEXT' } }),
    line({
      message: {
        model: 'claude-sonnet-5-5',
        usage: {
          input_tokens: 2,
          cache_creation_input_tokens: 583,
          cache_read_input_tokens: 249910,
          output_tokens: 256,
        },
      },
    }),
  ].join('\n');
  expect(parseUsage('claude', Buffer.from(tail))).toEqual({
    model: 'claude-sonnet-5-5',
    contextTokens: 250495,
    contextWindow: null,
    contextPct: null,
    compactedAt: null,
    freshTokens: null,
    limit: null,
  });
});

it('reports unknown as null, never zero, for empty, malformed or counter-less tails', () => {
  const none = {
    model: null,
    contextTokens: null,
    contextWindow: null,
    contextPct: null,
    compactedAt: null,
    freshTokens: null,
    limit: null,
  };
  expect(parseUsage('codex', Buffer.from(''))).toEqual(none);
  expect(parseUsage('claude', Buffer.from('not json\n{"message":{"usage":{}}}\n[1]'))).toEqual(
    none,
  );
  expect(
    parseUsage(
      'codex',
      Buffer.from(
        line({
          type: 'event_msg',
          payload: { type: 'token_count', info: { last_token_usage: { input_tokens: -5 } } },
        }),
      ),
    ).contextTokens,
  ).toBeNull();
});

const AT = '2026-10-07T01:00:00.000Z';
const assistant = (id: string, usage: object, model = 'claude-x', extra: object = {}) =>
  line({ type: 'assistant', timestamp: AT, message: { model, id, usage }, ...extra });
const U = {
  input_tokens: 2,
  cache_creation_input_tokens: 10,
  cache_read_input_tokens: 100,
  output_tokens: 5,
};

it('skips a synthetic or API-error row when reading the context, and says nothing rather than zero', () => {
  const real = assistant('real', { ...U, cache_read_input_tokens: 40_000 }, 'claude-real');
  const synthetic = assistant(
    'syn',
    {
      input_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
      output_tokens: 0,
    },
    '<synthetic>',
    { isApiErrorMessage: true },
  );
  const read = parseUsage('claude', Buffer.from([real, synthetic].join('\n')));
  expect(read).toMatchObject({ contextTokens: 40_012, model: 'claude-real' });
  const only = parseUsage('claude', Buffer.from(synthetic));
  expect(only).toMatchObject({ contextTokens: null, model: null });
});

it('sums every Claude assistant message once, though one message spans several lines', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'aether-usage-'));
  const total = async (name: string, ...lines: string[]) => {
    const file = join(dir, name);
    await writeFile(file, `${lines.join('\n')}\n`);
    return (await readUsage('claude', file)).freshTokens;
  };
  // Cache reads (100) are not counted; the message written twice counts once.
  expect(
    await total(
      'a.jsonl',
      assistant('a', U),
      assistant('a', U),
      '{"type":"user"}',
      assistant('b', U),
    ),
  ).toBe(34);
  // The counters after the message's own (one copy per iteration) are not added again.
  expect(await total('b.jsonl', assistant('c', { ...U, iterations: [{ ...U }, { ...U }] }))).toBe(
    17,
  );
  // A sub-agent's result carries usage but is no message of this session: it has no message id.
  const subagent = line({ type: 'user', toolUseResult: { usage: U }, message: { role: 'user' } });
  expect(await total('c.jsonl', subagent, assistant('d', U))).toBe(17);
});

it('lists a session spend equal to what the KPI parser counts on the same file, across chunk boundaries', async () => {
  const usage = {
    input_tokens: 3,
    cache_creation_input_tokens: 7,
    cache_read_input_tokens: 90,
    output_tokens: 5,
  };
  const filler = line({ type: 'user', message: { content: 'x'.repeat(2000) } });
  const lines: string[] = [];
  for (let n = 0; n < 4000; n++)
    lines.push(filler, assistant(`m${n}`, usage), assistant(`m${n}`, usage)); // each message written twice
  const text = `${lines.join('\n')}\n`;
  const file = join(await mkdtemp(join(tmpdir(), 'aether-usage-')), 'claude.jsonl');
  await writeFile(file, text); // about 8 MB: more than one chunk
  const read = await readUsage('claude', file);
  const state = newState('claude');
  parseChunk(state, Buffer.from(text), dayKeyOf('UTC'));
  expect(read.freshTokens).toBe(Object.values(state.days).reduce((n, b) => n + fresh(b), 0));
  expect(read.freshTokens).toBe(4000 * 15); // input 3 + cache written 7 + output 5, never the 90 read from the cache
});
