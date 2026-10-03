import { expect, it } from 'vitest';
import { parseUsage } from '../../apps/control/src/services/session-usage.js';

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
    line({ type: 'event_msg', payload: { type: 'token_count', info: null } }), // a rate-limit-only refresh
    line({ type: 'response_item', payload: { type: 'message', content: 'PRIVATE PROMPT TEXT' } }),
  ].join('\n');
  const usage = parseUsage('codex', tail);
  expect(usage).toEqual({
    model: 'gpt-new',
    contextTokens: 500,
    contextWindow: 1000,
    totalTokens: 900,
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
  expect(parseUsage('claude', tail)).toEqual({
    model: 'claude-sonnet-5-5',
    contextTokens: 250495,
    contextWindow: null,
    totalTokens: null,
  });
});

it('reports unknown as null, never zero, for empty, malformed or counter-less tails', () => {
  const none = { model: null, contextTokens: null, contextWindow: null, totalTokens: null };
  expect(parseUsage('codex', '')).toEqual(none);
  expect(parseUsage('claude', 'not json\n{"message":{"usage":{}}}\n[1]')).toEqual(none);
  expect(
    parseUsage(
      'codex',
      line({
        type: 'event_msg',
        payload: { type: 'token_count', info: { last_token_usage: { input_tokens: -5 } } },
      }),
    ).contextTokens,
  ).toBeNull();
});
