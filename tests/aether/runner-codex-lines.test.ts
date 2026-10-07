import { describe, expect, it } from 'vitest';
import {
  checkpointSchema,
  decodeLine,
  type ObserverCheckpoint,
} from '../../apps/runner/src/observer-codex-lines.js';

// Lines in the shape of a Codex rollout file. The version is one the repo has verified (providers/generated/compat.json).
const ROOT = '/work/project';
const checkpoint = (over: Partial<ObserverCheckpoint> = {}): ObserverCheckpoint => ({
  identity: 'file-1',
  offset: 0,
  prefixLength: 0,
  prefixHash: '',
  meta: null,
  failure: null,
  ...over,
});
const line = (record: unknown) => Buffer.from(JSON.stringify(record));
const meta = (over: Record<string, unknown> = {}) =>
  line({
    type: 'session_meta',
    payload: { id: 's1', cwd: ROOT, cli_version: '0.160.0', ...over },
  });
const item = (payload: unknown) => line({ type: 'response_item', payload });
const message = (role: string, ...texts: string[]) =>
  item({
    type: 'message',
    role,
    content: texts.map((text) => ({ type: role === 'user' ? 'input_text' : 'output_text', text })),
  });
const started = () => {
  const cp = checkpoint();
  expect(decodeLine(meta(), 0, cp, ROOT)).toBeNull();
  return cp;
};
const textOf = (outcome: ReturnType<typeof decodeLine>) =>
  outcome && typeof outcome === 'object' ? outcome.text : null;

describe('rollout session_meta', () => {
  it('names the session once the project and CLI version are right', () => {
    const cp = checkpoint();
    expect(decodeLine(meta(), 0, cp, ROOT)).toBeNull();
    expect(cp.meta).toEqual({ id: 's1', cwd: ROOT, cli_version: '0.160.0' });
  });

  it('refuses a session of another project, an unverified CLI version and a relative path', () => {
    for (const bad of [
      { cwd: '/elsewhere' },
      { cli_version: '9.9.9' },
      { cwd: 'relative' },
      { id: '' },
    ]) {
      const cp = checkpoint();
      expect(decodeLine(meta(bad), 0, cp, ROOT), JSON.stringify(bad)).toBe('unsupported_schema');
      expect(cp.meta).toBeNull();
    }
  });

  it('refuses a second session_meta that names a different session', () => {
    const cp = started();
    expect(decodeLine(meta(), 10, cp, ROOT)).toBeNull();
    expect(decodeLine(meta({ id: 's2' }), 20, cp, ROOT)).toBe('unsupported_schema');
    expect(cp.meta?.id).toBe('s1');
  });
});

describe('rollout conversation lines', () => {
  it('reads nothing before the session is named', () => {
    expect(decodeLine(message('user', 'hi'), 0, checkpoint(), ROOT)).toBe('unsupported_schema');
  });

  it('records a user or assistant message, joining its text parts', () => {
    const cp = started();
    expect(decodeLine(message('user', 'a', 'b'), 100, cp, ROOT)).toMatchObject({
      kind: 'message',
      role: 'user',
      text: 'a\nb',
      sessionId: 's1',
    });
    expect(decodeLine(message('assistant', 'done'), 200, cp, ROOT)).toMatchObject({
      role: 'assistant',
      text: 'done',
    });
  });

  it('gives each line its own source id from where it is in the file, and the same one on a re-read', () => {
    const cp = started();
    const a = decodeLine(message('user', 'same'), 100, cp, ROOT);
    const b = decodeLine(message('user', 'same'), 200, cp, ROOT);
    const again = decodeLine(message('user', 'same'), 100, cp, ROOT);
    expect(a).not.toEqual(b);
    expect(a).toEqual(again);
  });

  it('records the name of a tool call and nothing of its arguments', () => {
    const cp = started();
    const call = decodeLine(
      item({ type: 'function_call', name: 'shell', arguments: '{"cmd":"rm -rf /"}' }),
      5,
      cp,
      ROOT,
    );
    expect(call).toMatchObject({ kind: 'tool', role: 'assistant', text: 'shell' });
    expect(JSON.stringify(call)).not.toContain('rm -rf');
  });

  it('bounds a long message and a long tool name', () => {
    const cp = started();
    expect(textOf(decodeLine(message('user', 'x'.repeat(20000)), 1, cp, ROOT))).toHaveLength(16000);
    expect(
      textOf(decodeLine(item({ type: 'function_call', name: 'n'.repeat(500) }), 2, cp, ROOT)),
    ).toHaveLength(160);
  });

  it('skips what carries no conversation: other roles, empty text, reasoning, other channels', () => {
    const cp = started();
    expect(decodeLine(message('developer', 'rules'), 1, cp, ROOT)).toBeNull();
    expect(decodeLine(message('user', ''), 2, cp, ROOT)).toBeNull();
    expect(decodeLine(item({ type: 'reasoning', summary: [] }), 3, cp, ROOT)).toBeNull();
    const channel = (name: string) =>
      item({
        type: 'message',
        role: 'assistant',
        channel: name,
        content: [{ type: 'output_text', text: 'ok' }],
      });
    expect(decodeLine(channel('analysis'), 4, cp, ROOT)).toBeNull();
    expect(textOf(decodeLine(channel('final'), 5, cp, ROOT))).toBe('ok');
    expect(textOf(decodeLine(channel('commentary'), 6, cp, ROOT))).toBe('ok');
  });

  it('skips records and items known to be harmless', () => {
    const cp = started();
    for (const type of ['turn_context', 'event_msg', 'compacted', 'token_usage_record'])
      expect(decodeLine(line({ type, payload: {} }), 1, cp, ROOT), type).toBeNull();
    for (const type of ['function_call_output', 'custom_tool_call', 'web_search_call'])
      expect(decodeLine(item({ type }), 2, cp, ROOT), type).toBeNull();
  });

  it('reports a format it does not know instead of guessing', () => {
    const cp = started();
    expect(decodeLine(line({ type: 'brand_new_record' }), 1, cp, ROOT)).toBe('unsupported_schema');
    expect(decodeLine(item({ type: 'brand_new_item' }), 2, cp, ROOT)).toBe('unsupported_schema');
    expect(
      decodeLine(item({ type: 'message', role: 'user', content: 'not a list' }), 3, cp, ROOT),
    ).toBe('unsupported_schema');
    expect(decodeLine(line({ type: 'response_item', payload: 5 }), 4, cp, ROOT)).toBe(
      'unsupported_schema',
    );
  });

  it('reports a line that is not JSON, not an object or not valid UTF-8', () => {
    const cp = started();
    expect(decodeLine(Buffer.from('{broken'), 1, cp, ROOT)).toBe('unsupported_schema');
    expect(decodeLine(Buffer.from([0x7b, 0xff, 0xfe, 0x7d]), 2, cp, ROOT)).toBe(
      'unsupported_schema',
    );
    expect(decodeLine(Buffer.from('[1,2]'), 3, cp, ROOT)).toBe('unsupported_schema');
  });
});

describe('checkpointSchema', () => {
  it('is strict and bounds the remembered prefix', () => {
    const good = checkpoint();
    expect(checkpointSchema.safeParse(good).success).toBe(true);
    expect(checkpointSchema.safeParse({ ...good, extra: 1 }).success).toBe(false);
    expect(checkpointSchema.safeParse({ ...good, offset: -1 }).success).toBe(false);
    expect(checkpointSchema.safeParse({ ...good, prefixLength: 257 }).success).toBe(false);
    expect(checkpointSchema.safeParse({ ...good, failure: 'limit_exceeded' }).success).toBe(true);
    expect(checkpointSchema.safeParse({ ...good, failure: 'boom' }).success).toBe(false);
  });
});
