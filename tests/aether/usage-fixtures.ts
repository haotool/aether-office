import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export type ClaudeUsage = { i: number; cw?: number; cr?: number; o: number };

export function claudeLine(
  id: string,
  at: string,
  usage: ClaudeUsage,
  options: { model?: string; tools?: number; cwd?: string } = {},
): string {
  const blocks = [
    { type: 'text', text: 'x' },
    ...Array.from({ length: options.tools ?? 0 }, (_, n) => ({
      type: 'tool_use',
      id: `toolu_${id}_${n}`,
      name: 'Read',
      input: {},
    })),
  ];
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    message: {
      model: options.model ?? 'claude-sonnet-5-5',
      id,
      type: 'message',
      role: 'assistant',
      content: blocks,
      usage: {
        input_tokens: usage.i,
        cache_creation_input_tokens: usage.cw ?? 0,
        cache_read_input_tokens: usage.cr ?? 0,
        cache_creation: { ephemeral_5m_input_tokens: usage.cw ?? 0, ephemeral_1h_input_tokens: 0 },
        output_tokens: usage.o,
        service_tier: 'standard',
      },
    },
    type: 'assistant',
    uuid: `u-${id}`,
    timestamp: at,
    cwd: options.cwd ?? '/work/repo',
    sessionId: 's',
  });
}

export type CodexUsage = { input: number; cached?: number; output: number; reasoning?: number };
const codexUsage = (u: CodexUsage) => ({
  input_tokens: u.input,
  cached_input_tokens: u.cached ?? 0,
  cache_write_input_tokens: 0,
  output_tokens: u.output,
  reasoning_output_tokens: u.reasoning ?? 0,
  total_tokens: u.input + u.output,
});

export function codexCount(
  at: string,
  total: CodexUsage,
  last: CodexUsage,
  limits = false,
): string {
  return JSON.stringify({
    timestamp: at,
    ordinal: 1,
    type: 'event_msg',
    payload: {
      type: 'token_count',
      info: {
        total_token_usage: codexUsage(total),
        last_token_usage: codexUsage(last),
        model_context_window: 400000,
      },
      ...(limits
        ? {
            rate_limits: {
              primary: { used_percent: 41.5, window_minutes: 300, resets_at: 4_000_000_000 },
              secondary: { used_percent: 12, window_minutes: 10080, resets_at: 4_000_100_000 },
              plan_type: 'pro',
            },
          }
        : {}),
    },
  });
}

export const codexContext = (at: string, model: string) =>
  JSON.stringify({
    timestamp: at,
    type: 'turn_context',
    payload: { turn_id: 't', cwd: '/work/repo', model, effort: 'high' },
  });

export const codexTool = (at: string, type = 'function_call') =>
  JSON.stringify({ timestamp: at, type: 'response_item', payload: { type, name: 'shell' } });

export const codexMeta = (at: string, cwd = '/work/repo') =>
  JSON.stringify({ timestamp: at, type: 'session_meta', payload: { id: 'x', cwd } });

export const buffer = (...lines: string[]) => Buffer.from(lines.join('\n') + '\n');

export function writeLines(file: string, lines: string[], append = false) {
  mkdirSync(dirname(file), { recursive: true });
  const text = lines.join('\n') + '\n';
  if (append) appendFileSync(file, text);
  else writeFileSync(file, text);
}

export const claudeFile = (home: string, id: string, project = '-work-repo') =>
  join(home, '.claude/projects', project, `${id}.jsonl`);
export const codexFile = (home: string, id: string, day = '2026/10/07') =>
  join(home, '.codex/sessions', day, `rollout-2026-10-07T10-00-00-${id}.jsonl`);
