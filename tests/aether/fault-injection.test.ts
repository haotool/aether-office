import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Control } from '../../apps/control/src/control.js';
import type { Actor } from '../../packages/kernel/src/index.js';
import { command, fixture } from './fixture.js';

type Db = Control['ctx']['sqlite'];
const tables = (sql: Db) =>
  (
    sql
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name<>'schema_migrations'",
      )
      .all() as { name: string }[]
  ).map((t) => t.name);
const counts = (sql: Db) =>
  Object.fromEntries(
    tables(sql).map((t) => [
      t,
      (sql.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get() as { n: number }).n,
    ]),
  );

// Crash windows inside a command: after the domain write, after the event, after the outbox row and
// right before the idempotency journal. Each failure must leave NOTHING behind, and a retry of the
// same command must then take effect exactly once.
const WINDOWS = ['events', 'outbox', 'command_journal'] as const;

// A retrying client resends the identical envelope, so each scenario builds its command once.
type Envelope = Omit<ReturnType<typeof command>, 'idempotencyKey'> & { idempotencyKey: string };
type Scenario = {
  name: string;
  domain: string;
  build: (f: ReturnType<typeof fixture>, key: string) => { actor: Actor; input: Envelope };
};
const withKey = (input: ReturnType<typeof command>, key: string): Envelope => ({
  ...input,
  idempotencyKey: key,
});
const scenarios: Scenario[] = [
  {
    name: 'work.create',
    domain: 'work_items',
    build: (f, key) => ({
      actor: f.owner.actor,
      input: withKey(
        command('work.create', { title: 'Atomic', description: '', acceptance: 'x' }, f.projectId),
        key,
      ),
    }),
  },
  {
    name: 'message.send',
    domain: 'recipient_deliveries',
    build: (f, key) => ({
      actor: f.sender.actor,
      input: withKey(
        command(
          'message.send',
          { recipients: [f.recipientId], body: 'hello', kind: 'inform' },
          f.projectId,
        ),
        key,
      ),
    }),
  },
  {
    name: 'reservation.acquire',
    domain: 'file_reservations',
    build: (f, key) => ({
      actor: f.sender.actor,
      input: withKey(
        command('reservation.acquire', { patterns: ['src/**'], ttlSec: 60 }, f.projectId),
        key,
      ),
    }),
  },
  {
    name: 'schedule.create',
    domain: 'schedules',
    build: (f, key) => ({
      actor: f.owner.actor,
      input: withKey(
        command(
          'schedule.create',
          {
            name: 'S',
            spec: { kind: 'daily', time: '09:00' },
            template: { title: 'T', description: '', acceptance: 'a' },
          },
          f.projectId,
        ),
        key,
      ),
    }),
  },
  {
    name: 'skill.import',
    domain: 'skills',
    build: (f, key) => ({
      actor: f.owner.actor,
      input: withKey(
        command(
          'skill.import',
          { content: '---\nname: s\ndescription: d\n---\nbody' },
          f.projectId,
        ),
        key,
      ),
    }),
  },
];

describe.each(scenarios)('$name', (scenario) => {
  it.each(WINDOWS)(
    'rolls back completely when the write to %s fails, then succeeds exactly once on retry',
    (window) => {
      const f = fixture();
      const sql = f.control.ctx.sqlite;
      try {
        const key = `fault-${scenario.name}-${window}`;
        const before = counts(sql);
        sql
          .prepare(
            `CREATE TRIGGER inject_${window} BEFORE INSERT ON ${window} BEGIN SELECT RAISE(ABORT,'INJECTED_CRASH'); END`,
          )
          .run();
        const { actor, input } = scenario.build(f, key);
        expect(() => f.control.execute(actor, input)).toThrow('INJECTED_CRASH');
        expect(counts(sql)).toEqual(before); // no partial state in any table

        sql.prepare(`DROP TRIGGER inject_${window}`).run();
        f.control.execute(actor, input);
        const after = counts(sql);
        expect(after[scenario.domain]).toBe(before[scenario.domain]! + 1);
        f.control.execute(actor, input); // a client retrying the same key after success replays the receipt
        expect(counts(sql)).toEqual(after);
      } finally {
        f.control.close();
      }
    },
  );
});

it('a crash after commit but before the response is recovered by retrying the same key against the reopened database', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-crash-'));
  const file = join(directory, 'control.sqlite');
  try {
    const f = fixture(file);
    const message: Envelope = {
      ...command(
        'message.send',
        { recipients: [f.recipientId], body: 'durable', kind: 'request' },
        f.projectId,
      ),
      idempotencyKey: 'retry-after-crash',
    };
    const first = f.control.execute(f.sender.actor, message); // committed; pretend the response never reached the client
    f.control.close();

    const reopened = new Control(file, {
      mode: 'demo',
      cursorSecret: 'fixed-test-cursor-secret-32-characters',
    });
    try {
      const again = reopened.execute(reopened.identity(f.sender.actor.id), message);
      expect(again.commandId).toBe(first.commandId);
      expect(
        (
          reopened.ctx.sqlite
            .prepare("SELECT COUNT(*) AS n FROM messages WHERE body='durable'")
            .get() as { n: number }
        ).n,
      ).toBe(1);
      expect(
        (
          reopened.ctx.sqlite.prepare('SELECT COUNT(*) AS n FROM recipient_deliveries').get() as {
            n: number;
          }
        ).n,
      ).toBe(1);
    } finally {
      reopened.close();
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('a failed acknowledgement leaves the delivery unacknowledged, and the retried ack succeeds once', () => {
  const f = fixture();
  const sql = f.control.ctx.sqlite;
  try {
    const sent = f.control.execute(
      f.sender.actor,
      command(
        'message.send',
        { recipients: [f.recipientId], body: 'ack me', kind: 'inform' },
        f.projectId,
      ),
    );
    const ack: Envelope = {
      ...command(
        'message.ack',
        { messageId: String(sent.result['id']), recipientId: f.recipientId },
        f.projectId,
      ),
      idempotencyKey: 'ack-retry-key-1',
    };
    const state = () =>
      (
        sql
          .prepare('SELECT state FROM recipient_deliveries WHERE recipientId=?')
          .get(f.recipientId) as { state: string }
      ).state;
    expect(state()).toBe('available');
    sql
      .prepare(
        "CREATE TRIGGER inject_ack BEFORE INSERT ON events WHEN NEW.type='message.ack' BEGIN SELECT RAISE(ABORT,'INJECTED_CRASH'); END",
      )
      .run();
    expect(() => f.control.execute(f.recipient.actor, ack)).toThrow('INJECTED_CRASH');
    expect(state()).toBe('available'); // not half-acknowledged
    sql.prepare('DROP TRIGGER inject_ack').run();
    f.control.execute(f.recipient.actor, ack);
    expect(state()).toBe('acknowledged');
    f.control.execute(f.recipient.actor, ack);
    expect(state()).toBe('acknowledged');
  } finally {
    f.control.close();
  }
});
