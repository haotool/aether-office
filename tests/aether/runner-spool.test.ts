import { randomUUID } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import type { RunCommand } from '../../packages/contracts/src/index.js';
import { Journal } from '../../apps/runner/src/journal.js';
import { Runner } from '../../apps/runner/src/runner.js';

const received: { path: string; body: { sourceEventId?: string; summary?: string } }[] = [];
let mode: 'up' | 'down' | 'drop-response-once' = 'up';
let dropped = false;
let server: http.Server;
let url: string;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (d) => (raw += d));
    req.on('end', () => {
      if (mode === 'down') return void res.writeHead(503).end('{}');
      const body = raw ? JSON.parse(raw) : {};
      received.push({ path: req.url ?? '', body });
      if (mode === 'drop-response-once' && !dropped && body.summary === 'second') {
        dropped = true;
        return void req.socket.destroy();
      }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ duplicate: false, command: null }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));
beforeEach(() => {
  received.length = 0;
  mode = 'up';
  dropped = false;
});

const event = (summary: string) => ({
  type: 'result' as const,
  sourceEventId: randomUUID(),
  runId: randomUUID(),
  epoch: 1,
  outcome: 'submitted' as const,
  summary,
});

it('keeps committed events through an outage and a runner restart, then delivers them in order', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-spool-'));
  const file = join(dir, 'journal.json');
  try {
    const first = new Runner(url, 'token', new Journal(file));
    const events = ['first', 'second', 'third'].map(event);
    for (const e of events) first.journal.enqueue(e);

    mode = 'down';
    await expect(first.flush()).rejects.toThrow('CONTROL_HTTP_503');
    expect(first.journal.state.pending).toHaveLength(3);

    const restarted = new Runner(url, 'token', new Journal(file));
    expect(restarted.journal.state.pending.map((e) => (e as { summary: string }).summary)).toEqual([
      'first',
      'second',
      'third',
    ]);
    mode = 'up';
    await restarted.flush();
    expect(received.map((r) => r.body.summary)).toEqual(['first', 'second', 'third']);
    expect(new Journal(file).state.pending).toEqual([]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('resends after a lost response, so control sees a duplicate it can deduplicate by sourceEventId, never a gap', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-spool-'));
  try {
    const runner = new Runner(url, 'token', new Journal(join(dir, 'journal.json')));
    const events = ['first', 'second', 'third'].map(event);
    for (const e of events) runner.journal.enqueue(e);
    mode = 'drop-response-once';
    await expect(runner.flush()).rejects.toThrow();
    expect(runner.journal.state.pending.map((e) => (e as { summary: string }).summary)).toEqual([
      'second',
      'third',
    ]);
    await runner.flush();
    const ids = received.map((r) => r.body.sourceEventId);
    expect(received.map((r) => r.body.summary)).toEqual(['first', 'second', 'second', 'third']);
    expect(new Set(ids).size).toBe(3);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

it('after a crash the runner reports an unfinished run as indeterminate and never re-executes it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aether-spool-'));
  const file = join(dir, 'journal.json');
  try {
    const journal = new Journal(file);
    const command = {
      id: randomUUID(),
      runId: randomUUID(),
      sessionId: randomUUID(),
      projectId: randomUUID(),
      agentId: randomUUID(),
      workId: randomUUID(),
      attempt: 1,
      epoch: 1,
      maxTurns: 1,
      timeoutMs: 1000,
      provider: 'demo',
      mode: 'demo',
      prompt: 'p',
      root: null,
    } as RunCommand;
    journal.accept(command);
    journal.state.runs[command.runId]!.state = 'running';
    journal.save();

    const runner = new Runner(url, 'token', new Journal(file));
    runner.start();
    runner.stop();
    const pending = runner.journal.state.pending as {
      runId: string;
      outcome: string;
      summary: string;
    }[];
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ runId: command.runId, outcome: 'indeterminate' });
    expect(pending[0]!.summary).toContain('no automatic retry');
    expect(new Journal(file).state.runs[command.runId]!.state).toBe('finished');
    const again = new Runner(url, 'token', new Journal(file));
    again.start();
    again.stop();
    expect(new Journal(file).state.pending).toHaveLength(1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
