import { randomUUID } from 'node:crypto';
import { it, expect } from 'vitest';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  renameSync,
  unlinkSync,
  symlinkSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CodexObserver, observeClaudeFile } from '../../apps/runner/src/observer.js';
import { discoverObservationFiles } from '../../apps/runner/src/observer-source.js';
const line = (value: unknown) => JSON.stringify(value) + '\n';
it('observes only approved files with complete UTF-8 lines, durable cursors, rotation and explicit unknown formats', () => {
  const root = mkdtempSync(join(tmpdir(), 'aether-observer-'));
  const logs = join(root, 'logs');
  mkdirSync(logs);
  const file = join(logs, 'session.jsonl');
  const header = (id = 'fixture', version = '0.159.2') =>
    line({ type: 'session_meta', payload: { id, cwd: realpathSync(root), cli_version: version } });
  const message = (text: string, channel = 'final') =>
    line({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        channel,
        content: [{ type: 'output_text', text }],
      },
    });
  try {
    writeFileSync(
      file,
      header() + message('PRIVATE_THOUGHT', 'analysis') + message('VISIBLE 狐狸'),
    );
    const original = readFileSync(file);
    const observer = new CodexObserver(logs, 'session.jsonl', root);
    expect(discoverObservationFiles(logs)).toEqual(['session.jsonl']);
    expect(() => new CodexObserver(logs, '../secret.jsonl', root)).toThrow(
      'OBSERVATION_PATH_NOT_GRANTED',
    );
    const first = observer.read();
    expect(first.status).toBe('observed');
    expect(first.records.map((r) => r.text)).toEqual(['VISIBLE 狐狸']);
    expect(readFileSync(file)).toEqual(original);
    expect(observer.read(first.checkpoint).records).toEqual([]);
    expect(observer.read().records[0]?.sourceId).toBe(first.records[0]?.sourceId);
    const bytes = Buffer.from(message('追加🦊'));
    const split = bytes.indexOf(Buffer.from('🦊')) + 1;
    appendFileSync(file, bytes.subarray(0, split));
    const partial = observer.read(first.checkpoint);
    expect(partial.status).toBe('partial');
    expect(partial.records).toEqual([]);
    appendFileSync(file, bytes.subarray(split));
    const resumed = new CodexObserver(logs, 'session.jsonl', root).read(partial.checkpoint);
    expect(resumed.records[0]?.text).toBe('追加🦊');
    renameSync(file, join(logs, 'old.log'));
    writeFileSync(file, header('second') + message('輪替'));
    const rotated = observer.read(resumed.checkpoint);
    expect(rotated.rotated).toBe(true);
    expect(rotated.records[0]?.sessionId).toBe('second');
    writeFileSync(file, header('third', 'not-a-version'));
    expect(observer.read(rotated.checkpoint).status).toBe('unsupported_schema');
    unlinkSync(file);
    expect(observer.read(rotated.checkpoint).status).toBe('missing');
    const secret = join(root, 'private.jsonl');
    writeFileSync(secret, header() + message('DO_NOT_READ'));
    symlinkSync(secret, file);
    expect(observer.read().status).toBe('blocked_path');
    expect(discoverObservationFiles(logs)).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('bounds ignored/oversized records and refuses a foreign project without claiming completion', () => {
  const root = mkdtempSync(join(tmpdir(), 'aether-observer-limits-'));
  const file = join(root, 'session.jsonl');
  try {
    const header = line({
      type: 'session_meta',
      payload: { id: 'fixture', cwd: realpathSync(root), cli_version: '0.159.2' },
    });
    const observer = new CodexObserver(root, 'session.jsonl', root);
    writeFileSync(file, header + '\n'.repeat(10000));
    const bounded = observer.read();
    expect(bounded.checkpoint!.offset).toBeLessThan(1000);
    expect(bounded.records).toEqual([]);
    writeFileSync(
      file,
      header +
        line({
          type: 'response_item',
          payload: {
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text: 'x'.repeat(70000) }],
          },
        }),
    );
    const oversized = observer.read();
    expect(oversized.status).toBe('limit_exceeded');
    expect(observer.read(oversized.checkpoint).status).toBe('limit_exceeded');
    writeFileSync(
      file,
      line({
        type: 'session_meta',
        payload: { id: 'foreign', cwd: tmpdir(), cli_version: '0.159.2' },
      }),
    );
    expect(observer.read().status).toBe('unsupported_schema');
    writeFileSync(
      file,
      header +
        line({
          type: 'event_msg',
          payload: { type: 'task_complete', message: 'not authoritative' },
        }),
    );
    expect(observer.read().records).toEqual([]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('uses the real Claude SDK read API on an approved file without spawning a model or exposing thinking', async () => {
  const root = mkdtempSync(join(tmpdir(), 'aether-claude-observer-'));
  const file = join(root, 'session.jsonl');
  try {
    const sessionId = randomUUID(),
      userId = randomUUID(),
      assistantId = randomUUID();
    const base = {
      sessionId,
      version: '999.0.0',
      cwd: realpathSync(root),
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
    writeFileSync(file, line(user) + line(assistant));
    const original = readFileSync(file);
    const observed = await observeClaudeFile(root, 'session.jsonl', root);
    expect(observed.status).toBe('observed');
    expect(observed.records.map((r) => r.text)).toEqual(['使用者問題', '可見回答']);
    expect(JSON.stringify(observed)).not.toContain('PRIVATE_THINKING');
    expect(readFileSync(file)).toEqual(original);
    expect(
      (await observeClaudeFile(root, 'session.jsonl', root)).records.map((r) => r.sourceId),
    ).toEqual(observed.records.map((r) => r.sourceId));
    appendFileSync(file, '{"type":"assistant"');
    expect((await observeClaudeFile(root, 'session.jsonl', root)).status).toBe('partial');
    writeFileSync(file, line({ ...user, version: 'unknown' }));
    expect((await observeClaudeFile(root, 'session.jsonl', root)).status).toBe(
      'unsupported_schema',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

it('decodes future rollouts, skips opaque additions and recovers a checkpoint rejected by the old version gate', () => {
  const root = mkdtempSync(join(tmpdir(), 'aether-observer-160-'));
  const project = realpathSync(root);
  const write = (name: string, lines: unknown[]) => {
    writeFileSync(join(root, name), lines.map((l) => JSON.stringify(l) + '\n').join(''));
    return new CodexObserver(root, name, project).read(null);
  };
  const meta = (version: string) => ({
    type: 'session_meta',
    payload: { id: 's', cwd: project, cli_version: version },
  });
  const message = {
    type: 'response_item',
    payload: { type: 'message', role: 'user', content: [{ type: 'input_text', text: 'hello' }] },
  };
  try {
    const verified = write('ok.jsonl', [
      meta('999.0.0'),
      { type: 'world_state', payload: {} },
      { type: 'token_usage_record', payload: {} },
      { type: 'inter_agent_communication_metadata', payload: {} },
      {
        type: 'response_item',
        payload: { type: 'agent_message', content: 'peer text is not a user message' },
      },
      message,
    ]);
    expect(verified.status).toBe('observed');
    expect(verified.records.map((r) => r.text)).toEqual(['hello']);
    expect(write('old.jsonl', [meta('0.130.0-alpha.5'), message]).records).toHaveLength(1);
    const legacy = { ...verified.checkpoint!, meta: null, failure: 'unsupported_schema' as const };
    const recovered = new CodexObserver(root, 'ok.jsonl', project).read(legacy);
    expect(recovered.records).toEqual(verified.records);
    expect(
      write('new.jsonl', [
        meta('999.0.0'),
        { type: 'brand_new_record', payload: {} },
        message,
      ]).records.map((r) => r.text),
    ).toEqual(['hello']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
