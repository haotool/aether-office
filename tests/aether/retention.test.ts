import { expect, it } from 'vitest';
import { command, fixture } from './fixture.js';
import { RETENTION, pruneRetention } from '../../apps/control/src/services/domain/retention.js';

const DAY = 24 * 60 * 60 * 1000;

it('prunes what is past its retention, keeps the newest event and every row still in use', () => {
  let now = 1_000 * DAY;
  const f = fixture(':memory:', () => now);
  const db = f.control.ctx.sqlite;
  const count = (table: string) =>
    (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  const create = (title: string) =>
    f.control.execute(
      f.owner.actor,
      command('work.create', { title, description: '', acceptance: 'x' }, f.projectId),
    );
  create('old');
  const oldEvents = count('events');
  now += RETENTION.eventsMs + DAY;
  create('new');
  const newest = (db.prepare('SELECT MAX(seq) AS seq FROM events').get() as { seq: number }).seq;
  // Rows that reference parents the test does not build.
  db.pragma('foreign_keys = OFF');
  const old = (age: number) => now - age - DAY;
  db.prepare('INSERT INTO command_journal VALUES (?,?,?,?,?,?)').run(
    'j1',
    'i',
    'k1',
    'h',
    '{}',
    old(RETENTION.commandJournalMs),
  );
  db.prepare('INSERT INTO command_journal VALUES (?,?,?,?,?,?)').run(
    'j2',
    'i',
    'k2',
    'h',
    '{}',
    now,
  );
  db.prepare(
    "INSERT INTO runs(id,projectId,workId,agentId,provider,mode,state,createdAt) VALUES ('run-done','p','w','a','x','x','succeeded',0),('run-live','p','w','a','x','x','running',0)",
  ).run();
  for (const [id, run] of [
    ['r1', 'run-done'],
    ['r2', 'run-live'],
  ] as const)
    db.prepare('INSERT INTO runner_reports VALUES (?,?,?,?)').run(
      id,
      'm',
      run,
      old(RETENTION.runnerReportsMs),
    );
  db.prepare('INSERT INTO webhook_deliveries VALUES (?,?,?)').run(
    'c',
    'd-old',
    old(RETENTION.webhookDeliveriesMs),
  );
  db.prepare('INSERT INTO webhook_deliveries VALUES (?,?,?)').run('c', 'd-new', now);
  db.prepare('INSERT INTO browser_sessions VALUES (?,?,?,?)').run('t-old', 'i', 'c', now - 1);
  db.prepare('INSERT INTO browser_sessions VALUES (?,?,?,?)').run('t-live', 'i', 'c', now + DAY);
  db.pragma('foreign_keys = ON');
  const before = count('events');

  expect(pruneRetention(f.control.ctx)).toBeGreaterThan(oldEvents - 1);

  expect(count('events')).toBe(before - oldEvents);
  expect(count('outbox')).toBe(count('events')); // an outbox row never outlives or lacks its event
  expect((db.prepare('SELECT MAX(seq) AS seq FROM events').get() as { seq: number }).seq).toBe(
    newest,
  );
  expect(db.prepare("SELECT id FROM command_journal WHERE id IN ('j1','j2')").all()).toEqual([
    { id: 'j2' },
  ]);
  expect(db.prepare('SELECT sourceEventId FROM runner_reports').all()).toEqual([
    { sourceEventId: 'r2' },
  ]);
  expect(db.prepare('SELECT deliveryId FROM webhook_deliveries').all()).toEqual([
    { deliveryId: 'd-new' },
  ]);
  expect(db.prepare('SELECT tokenHash FROM browser_sessions').all()).toEqual([
    { tokenHash: 't-live' },
  ]);
  expect(pruneRetention(f.control.ctx)).toBe(0); // idempotent
});
