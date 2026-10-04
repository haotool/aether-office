import { expect, it } from 'vitest';
import { parseUsage, sumClaudeTokens } from '../../apps/control/src/services/session-usage.js';

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
          total_token_usage: { total_tokens: 900 },
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
    totalTokens: 900,
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
    totalTokens: null,
    limit: null,
  });
});

it('reports unknown as null, never zero, for empty, malformed or counter-less tails', () => {
  const none = {
    model: null,
    contextTokens: null,
    contextWindow: null,
    totalTokens: null,
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

it('sums every Claude assistant message once, though one message spans several lines', () => {
  const line = (id: string, usage: object) =>
    JSON.stringify({ type: 'assistant', message: { model: 'claude-x', id, usage } });
  const u = {
    input_tokens: 2,
    cache_creation_input_tokens: 10,
    cache_read_input_tokens: 100,
    output_tokens: 5,
  };
  const data = (...lines: string[]) => Buffer.from(lines.join('\n'));
  const text = data(line('a', u), line('a', u), '{"type":"user"}', line('b', u), 'cut {"usage"');
  expect(sumClaudeTokens(text, null)).toEqual({ tokens: 234, lastId: 'b' });
  expect(sumClaudeTokens(data(line('b', u)), 'b').tokens).toBe(0); // continues a message from the previous chunk
  // The counters after the message's own (one copy per iteration) are not added again.
  const iterated = line('c', { ...u, iterations: [{ ...u }, { ...u }] });
  expect(sumClaudeTokens(data(iterated), null).tokens).toBe(117);
  // A sub-agent's result carries usage but is no message of this session: it has no message id.
  const subagent = JSON.stringify({
    type: 'user',
    toolUseResult: { usage: u },
    message: { role: 'user' },
  });
  expect(sumClaudeTokens(data(subagent, line('d', u)), null).tokens).toBe(117);
});

it('totals a real file the same as summing its text, across chunk boundaries', async () => {
  const { mkdtemp, writeFile } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const usage = {
    input_tokens: 3,
    cache_creation_input_tokens: 7,
    cache_read_input_tokens: 90,
    output_tokens: 5,
  };
  const line = (id: string) => JSON.stringify({ type: 'assistant', message: { id, usage } });
  const filler = JSON.stringify({ type: 'user', message: { content: 'x'.repeat(2000) } });
  const lines: string[] = [];
  for (let n = 0; n < 4000; n++) lines.push(filler, line(`m${n}`), line(`m${n}`)); // each message written twice
  const text = `${lines.join('\n')}\n`;
  const file = join(await mkdtemp(join(tmpdir(), 'aether-usage-')), 'claude.jsonl');
  await writeFile(file, text); // about 8 MB: more than one chunk
  const { readUsage } = await import('../../apps/control/src/services/session-usage.js');
  const read = await readUsage('claude', file);
  expect(read.totalTokens).toBe(sumClaudeTokens(Buffer.from(text), null).tokens);
  expect(read.totalTokens).toBe(4000 * 105);
});
