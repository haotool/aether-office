import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexObserver, observeClaudeFile } from '../../apps/runner/src/observer.js';
import { discoverObservationFiles } from '../../apps/runner/src/observer-source.js';
const line = (value: unknown) => JSON.stringify(value) + '\n';
const meta = (cwd: string, id = 'fixture', version = '0.159.2') => ({
  type: 'session_meta',
  payload: { id, cwd, cli_version: version },
});
const message = (text: string, role = 'assistant', channel = 'final') => ({
  type: 'response_item',
  payload: {
    type: 'message',
    role,
    channel,
    content: [{ type: role === 'user' ? 'input_text' : 'output_text', text }],
  },
});
it('observes only approved files with complete UTF-8 lines, durable cursors, rotation and explicit unknown formats', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'aether-observer-'));
  const logs = join(root, 'logs');
  fs.mkdirSync(logs);
  const file = join(logs, 'session.jsonl');
  const header = (id = 'fixture', version = '0.159.2') =>
    line(meta(fs.realpathSync(root), id, version));
  const assistant = (text: string, channel = 'final') => line(message(text, 'assistant', channel));
  try {
    fs.writeFileSync(
      file,
      header() + assistant('PRIVATE_THOUGHT', 'analysis') + assistant('VISIBLE 狐狸'),
    );
    const original = fs.readFileSync(file);
    const observer = new CodexObserver(logs, 'session.jsonl', root);
    expect(discoverObservationFiles(logs)).toEqual(['session.jsonl']);
    expect(() => new CodexObserver(logs, '../secret.jsonl', root)).toThrow(
      'OBSERVATION_PATH_NOT_GRANTED',
    );
    const first = observer.read();
    expect(first.status).toBe('observed');
    expect(first.records.map((r) => r.text)).toEqual(['VISIBLE 狐狸']);
    expect(fs.readFileSync(file)).toEqual(original);
    expect(observer.read(first.checkpoint).records).toEqual([]);
    expect(observer.read().records[0]?.sourceId).toBe(first.records[0]?.sourceId);
    const bytes = Buffer.from(assistant('追加🦊'));
    const split = bytes.indexOf(Buffer.from('🦊')) + 1;
    fs.appendFileSync(file, bytes.subarray(0, split));
    const partial = observer.read(first.checkpoint);
    expect(partial.status).toBe('partial');
    expect(partial.records).toEqual([]);
    fs.appendFileSync(file, bytes.subarray(split));
    const resumed = new CodexObserver(logs, 'session.jsonl', root).read(partial.checkpoint);
    expect(resumed.records[0]?.text).toBe('追加🦊');
    fs.renameSync(file, join(logs, 'old.log'));
    fs.writeFileSync(file, header('second') + assistant('輪替'));
    const rotated = observer.read(resumed.checkpoint);
    expect(rotated.rotated).toBe(true);
    expect(rotated.records[0]?.sessionId).toBe('second');
    fs.writeFileSync(file, header('third', 'not-a-version'));
    expect(observer.read(rotated.checkpoint).status).toBe('unsupported_schema');
    fs.unlinkSync(file);
    expect(observer.read(rotated.checkpoint).status).toBe('missing');
    const secret = join(root, 'private.jsonl');
    fs.writeFileSync(secret, header() + assistant('DO_NOT_READ'));
    fs.symlinkSync(secret, file);
    expect(observer.read().status).toBe('blocked_path');
    expect(discoverObservationFiles(logs)).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
it('bounds ignored/oversized records and refuses a foreign project without claiming completion', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'aether-observer-limits-'));
  const file = join(root, 'session.jsonl');
  try {
    const header = line(meta(fs.realpathSync(root)));
    const observer = new CodexObserver(root, 'session.jsonl', root);
    fs.writeFileSync(file, header + '\n'.repeat(10000));
    const bounded = observer.read();
    expect(bounded.checkpoint!.offset).toBeLessThan(1000);
    expect(bounded.records).toEqual([]);
    fs.writeFileSync(file, header + line(message('x'.repeat(70000))));
    const oversized = observer.read();
    expect(oversized.status).toBe('limit_exceeded');
    expect(observer.read(oversized.checkpoint).status).toBe('limit_exceeded');
    fs.writeFileSync(file, line(meta(tmpdir(), 'foreign')));
    expect(observer.read().status).toBe('unsupported_schema');
    fs.writeFileSync(
      file,
      header +
        line({
          type: 'event_msg',
          payload: { type: 'task_complete', message: 'not authoritative' },
        }),
    );
    expect(observer.read().records).toEqual([]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('uses the real Claude SDK read API on an approved file without spawning a model or exposing thinking', async () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'aether-claude-observer-'));
  const file = join(root, 'session.jsonl');
  try {
    const sessionId = randomUUID(),
      userId = randomUUID(),
      assistantId = randomUUID();
    const base = {
      sessionId,
      version: '999.0.0',
      cwd: fs.realpathSync(root),
      timestamp: '2026-10-01T00:00:00.000Z',
      isSidechain: false,
    };
    const user = {
      ...base,
      type: 'user',
      uuid: userId,
      parentUuid: null,
      message: { role: 'user', content: '使用者問題' },
    };
    const assistant = {
      ...base,
      type: 'assistant',
      uuid: assistantId,
      parentUuid: userId,
      message: {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'PRIVATE_THINKING' },
          { type: 'text', text: '可見回答' },
        ],
      },
    };
    fs.writeFileSync(file, line(user) + line(assistant));
    const original = fs.readFileSync(file);
    const observed = await observeClaudeFile(root, 'session.jsonl', root);
    expect(observed.status).toBe('observed');
    expect(observed.records.map((r) => r.text)).toEqual(['使用者問題', '可見回答']);
    expect(JSON.stringify(observed)).not.toContain('PRIVATE_THINKING');
    expect(fs.readFileSync(file)).toEqual(original);
    expect(
      (await observeClaudeFile(root, 'session.jsonl', root)).records.map((r) => r.sourceId),
    ).toEqual(observed.records.map((r) => r.sourceId));
    fs.appendFileSync(file, '{"type":"assistant"');
    expect((await observeClaudeFile(root, 'session.jsonl', root)).status).toBe('partial');
    fs.writeFileSync(file, line({ ...user, version: 'unknown' }));
    expect((await observeClaudeFile(root, 'session.jsonl', root)).status).toBe(
      'unsupported_schema',
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

it('decodes future rollouts, skips opaque additions and recovers a checkpoint rejected by the old version gate', () => {
  const root = fs.mkdtempSync(join(tmpdir(), 'aether-observer-160-'));
  const project = fs.realpathSync(root);
  const write = (name: string, lines: unknown[]) => {
    fs.writeFileSync(join(root, name), lines.map((l) => JSON.stringify(l) + '\n').join(''));
    return new CodexObserver(root, name, project).read(null);
  };
  const sessionMeta = (version: string) => meta(project, 's', version);
  const userMessage = message('hello', 'user');
  try {
    const verified = write('ok.jsonl', [
      sessionMeta('999.0.0'),
      { type: 'world_state', payload: {} },
      { type: 'token_usage_record', payload: {} },
      { type: 'inter_agent_communication_metadata', payload: {} },
      {
        type: 'response_item',
        payload: { type: 'agent_message', content: 'peer text is not a user message' },
      },
      userMessage,
    ]);
    expect(verified.status).toBe('observed');
    expect(verified.records.map((r) => r.text)).toEqual(['hello']);
    expect(write('old.jsonl', [sessionMeta('0.130.0-alpha.5'), userMessage]).records).toHaveLength(
      1,
    );
    const legacy = {
      ...verified.checkpoint!,
      decoderVersion: undefined,
      meta: null,
      failure: 'unsupported_schema' as const,
    };
    const recovered = new CodexObserver(root, 'ok.jsonl', project).read(legacy);
    expect(recovered.records).toEqual(verified.records);
    expect(
      write('new.jsonl', [
        sessionMeta('999.0.0'),
        { type: 'brand_new_record', payload: {} },
        userMessage,
      ]).records.map((r) => r.text),
    ).toEqual(['hello']);
    fs.appendFileSync(
      join(root, 'ok.jsonl'),
      line({ type: 'response_item', payload: { type: 'message', role: 'assistant' } }),
    );
    const failed = new CodexObserver(root, 'ok.jsonl', project).read(recovered.checkpoint);
    expect(failed.status).toBe('unsupported_schema');
    expect(new CodexObserver(root, 'ok.jsonl', project).read(failed.checkpoint)).toMatchObject({
      status: 'unsupported_schema',
      records: [],
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
