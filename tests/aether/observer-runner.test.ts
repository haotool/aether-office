import { it, expect, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { createServer as reservePort } from 'node:net';
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  appendFileSync,
  readFileSync,
  rmSync,
  realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Control } from '../../apps/control/src/control.js';
import { createServer } from '../../apps/control/src/server.js';
import { enroll } from '../../apps/control/src/services/runtime/runners.js';
import { NativeExecutor } from '../../apps/runner/src/native.js';
import { Journal } from '../../apps/runner/src/journal.js';
import { Runner } from '../../apps/runner/src/runner.js';
import { ObserverRunner } from '../../apps/runner/src/observers.js';
import { command } from './fixture.js';
it.each(['codex', 'claude'] as const)(
  '%s observation survives commit-before-ACK loss and journal failure over real HTTP',
  async (provider) => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'aether-observe-wire-')));
    const logs = join(root, 'logs');
    mkdirSync(logs);
    const file = join(logs, 'session.jsonl');
    let now = 100000;
    const control = new Control(join(root, 'control.sqlite'), { mode: 'live', now: () => now });
    const reservation = reservePort();
    await new Promise<void>((resolve) => reservation.listen(0, '127.0.0.1', resolve));
    const port = (reservation.address() as { port: number }).port;
    await new Promise<void>((resolve, reject) =>
      reservation.close((error) => (error ? reject(error) : resolve())),
    );
    const url = `http://127.0.0.1:${port}`;
    const app = createServer(control, { origin: url });
    let blocked = false;
    let entered: () => void = () => {};
    let release: () => void = () => {};
    let gate = Promise.resolve();
    app.addHook('preHandler', async (request) => {
      if (blocked && request.url === '/api/runner/observations') {
        entered();
        await gate;
      }
    });
    try {
      const owner = control.createIdentity(undefined, {
        name: 'Owner',
        role: 'owner',
        projectIds: ['*'],
      });
      const projectId = String(
        control.execute(owner.actor, command('project.create', { name: 'Observed fixture', root }))
          .result['id'],
      );
      const agentId = String(
        control.execute(
          owner.actor,
          command(
            'agent.register',
            {
              name: 'External',
              role: 'Observer',
              provider: 'observe',
              species: 'fox',
              color: '#112233',
            },
            projectId,
          ),
        ).result['id'],
      );
      const workId = String(
        control.execute(
          owner.actor,
          command(
            'work.create',
            { title: 'Not controlled by logs', description: '', acceptance: 'No mutation' },
            projectId,
          ),
        ).result['id'],
      );
      const machine = enroll(control.ctx, owner.actor, 'Observed fixture machine', [projectId]);
      const native = new NativeExecutor(join(root, 'workspaces'), {
        enabled: true,
        repositories: [root],
        binaries: {},
        observations: {
          external: {
            provider,
            projectId,
            agentId,
            projectRoot: root,
            approvedRoot: logs,
            files: ['session.jsonl'],
          },
        },
      });
      const sessionId = randomUUID(),
        uuids = Array.from({ length: 6 }, () => randomUUID());
      const line = (data: unknown) => JSON.stringify(data) + '\n';
      const record = (i: number) =>
        provider === 'codex'
          ? line({
              type: 'response_item',
              payload: {
                type: 'message',
                role: 'assistant',
                channel: 'final',
                content: [{ type: 'output_text', text: `Visible ${i} ` + '狐狸'.repeat(7000) }],
              },
            })
          : line({
              type: i === 0 ? 'user' : 'assistant',
              uuid: uuids[i],
              parentUuid: uuids[i - 1] ?? null,
              sessionId,
              cwd: root,
              version: '2.1.286',
              timestamp: '2026-10-01T00:00:00.000Z',
              message: {
                role: i === 0 ? 'user' : 'assistant',
                content: [{ type: 'text', text: `Visible ${i} ` + '狐狸'.repeat(7000) }],
              },
            });
      writeFileSync(
        file,
        (provider === 'codex'
          ? line({
              type: 'session_meta',
              payload: { id: sessionId, cwd: root, cli_version: '0.159.2' },
            })
          : '') +
          record(0) +
          record(1) +
          record(2) +
          record(3),
      );
      await app.listen({ host: '127.0.0.1', port });
      const filename = join(root, 'journal.json');
      let journal = new Journal(filename);
      let loseAck = true;
      const api = async (path: string, body: unknown) => {
        const durable = new Journal(filename);
        expect(Object.values(durable.state.observers)[0]?.pending.length).toBeGreaterThan(0);
        expect(Buffer.byteLength(JSON.stringify(body))).toBeLessThan(120000);
        const response = await fetch(new URL(path, url), {
          method: 'POST',
          headers: { authorization: `Bearer ${machine.token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!response.ok) throw new Error(`HTTP_${response.status}`);
        const value = await response.json();
        if (loseAck) {
          loseAck = false;
          throw new Error('SIMULATED_ACK_LOSS');
        }
        return value;
      };
      let runner = new ObserverRunner(journal, native, api, () => now);
      await expect(runner.tick()).rejects.toThrow('SIMULATED_ACK_LOSS');
      const count = () =>
        Number(
          (
            control.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM observation_records').get() as {
              n: number;
            }
          ).n,
        );
      expect(count()).toBe(2);
      appendFileSync(file, record(4));
      journal = new Journal(filename);
      runner = new ObserverRunner(journal, native, api, () => now);
      now += 1000;
      await runner.tick();
      expect(count()).toBe(5);
      const key = Object.keys(journal.state.observers)[0]!;
      const before = JSON.stringify(journal.state.observers[key]);
      appendFileSync(file, record(5));
      const failure = vi.spyOn(journal, 'save').mockImplementationOnce(() => {
        throw new Error('SIMULATED_DISK_FULL');
      });
      now += 1000;
      await expect(runner.tick()).rejects.toThrow('SIMULATED_DISK_FULL');
      failure.mockRestore();
      expect(JSON.stringify(journal.state.observers[key])).toBe(before);
      expect(JSON.stringify(new Journal(filename).state.observers[key])).toBe(before);
      expect(count()).toBe(5);
      now += 1000;
      await runner.tick();
      expect(count()).toBe(6);
      expect(
        control.events(owner.actor, projectId, '0').filter((e) => e.type === 'observation.message'),
      ).toHaveLength(6);
      expect(
        control.snapshot(owner.actor, projectId).work.find((w) => w.id === workId)?.state,
      ).toBe('ready');
      expect(readFileSync(file, 'utf8')).toContain('Visible 5');
      writeFileSync(file, '{"type":"unexpected-format"}\n');
      now += 1000;
      await runner.tick();
      expect(control.ctx.sqlite.prepare('SELECT state FROM observation_sources').get()).toEqual({
        state: 'unsupported_schema',
      });
      expect(count()).toBe(6);
      if (provider === 'codex') {
        gate = new Promise<void>((resolve) => {
          release = resolve;
        });
        const started = new Promise<void>((resolve) => {
          entered = resolve;
        });
        blocked = true;
        const background = new Runner(url, machine.token, journal, native);
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          const tick = background.tick();
          await started;
          await Promise.race([
            tick,
            new Promise((_, reject) => {
              timer = setTimeout(() => reject(new Error('OBSERVATION_BLOCKED_DISPATCH')), 1000);
            }),
          ]);
        } finally {
          if (timer) clearTimeout(timer);
          release();
          blocked = false;
          await background.shutdown();
        }
      }
    } finally {
      vi.restoreAllMocks();
      await app.close();
      control.close();
      rmSync(root, { recursive: true, force: true });
    }
  },
  15000,
);
