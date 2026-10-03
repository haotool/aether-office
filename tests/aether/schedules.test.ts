import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { Control } from '../../apps/control/src/control.js';
import { listSchedules, tickSchedules } from '../../apps/control/src/services/schedules.js';
import { command, fixture } from './fixture.js';

const utc = (iso: string) => Date.parse(iso);
const template = { title: 'Nightly check', description: '', acceptance: 'Report is posted' };

function setup(start: string) {
  const directory = mkdtempSync(join(tmpdir(), 'aether-schedule-'));
  const file = join(directory, 'control.sqlite');
  const clock = { now: utc(start) };
  const f = fixture(file, () => clock.now);
  const create = (data: Record<string, unknown>) =>
    f.control.execute(
      f.owner.actor,
      command('schedule.create', { name: 'S', template, ...data }, f.projectId),
    );
  const works = (control: Control = f.control) =>
    control.ctx.sqlite
      .prepare('SELECT title,state,assignee FROM work_items WHERE title=?')
      .all(template.title) as { state: string; assignee: string | null }[];
  return { f, file, directory, clock, create, works };
}

it('dispatches at the local time in the schedule timezone exactly once, creating unassigned work only', () => {
  const t = setup('2026-10-03T00:00:00Z');
  try {
    t.create({ spec: { kind: 'daily', time: '09:00' }, timezone: 'Asia/Taipei' }); // 01:00 UTC
    expect(tickSchedules(t.f.control.ctx)).toBe(0);
    t.clock.now = utc('2026-10-03T00:59:59Z');
    expect(tickSchedules(t.f.control.ctx)).toBe(0);
    t.clock.now = utc('2026-10-03T01:00:05Z');
    expect(tickSchedules(t.f.control.ctx)).toBe(1);
    expect(tickSchedules(t.f.control.ctx)).toBe(0); // second ticker / retry
    expect(t.works()).toEqual([{ title: 'Nightly check', state: 'ready', assignee: null }]); // no agent, no spend
    expect(listSchedules(t.f.control.ctx, t.f.projectId)[0]!.nextRunAt).toBe(
      utc('2026-10-04T01:00:00Z'),
    );
  } finally {
    t.f.control.close();
    rmSync(t.directory, { recursive: true, force: true });
  }
});

it('does not dispatch twice across a restart', () => {
  const t = setup('2026-10-03T00:00:00Z');
  try {
    t.create({ spec: { kind: 'daily', time: '09:00' }, timezone: 'Asia/Taipei' });
    t.clock.now = utc('2026-10-03T01:00:10Z');
    expect(tickSchedules(t.f.control.ctx)).toBe(1);
    t.f.control.close();
    const reopened = new Control(t.file, {
      mode: 'demo',
      cursorSecret: 'fixed-test-cursor-secret-32-characters',
      now: () => t.clock.now,
    });
    expect(tickSchedules(reopened.ctx)).toBe(0);
    expect(t.works(reopened)).toHaveLength(1);
    reopened.close();
  } finally {
    rmSync(t.directory, { recursive: true, force: true });
  }
});

it('catches up once after an outage with policy single, and not at all with skip', () => {
  for (const [missed, expected] of [
    ['single', 1],
    ['skip', 0],
  ] as const) {
    const t = setup('2026-10-01T00:00:00Z');
    try {
      t.create({ spec: { kind: 'daily', time: '09:00' }, timezone: 'Asia/Taipei', missed });
      t.clock.now = utc('2026-10-05T03:00:00Z'); // four missed days
      expect(tickSchedules(t.f.control.ctx), missed).toBe(expected);
      expect(t.works()).toHaveLength(expected);
      expect(listSchedules(t.f.control.ctx, t.f.projectId)[0]!.nextRunAt).toBe(
        utc('2026-10-06T01:00:00Z'),
      );
    } finally {
      t.f.control.close();
      rmSync(t.directory, { recursive: true, force: true });
    }
  }
});

it('re-enabling never replays what was missed while off; invalid input is refused', () => {
  const t = setup('2026-10-03T00:00:00Z');
  try {
    const created = t.create({
      spec: { kind: 'daily', time: '09:00' },
      timezone: 'Asia/Taipei',
      missed: 'single',
    }).result as { id: string; version: number };
    const toggle = (enabled: boolean, version: number) =>
      t.f.control.execute(
        t.f.owner.actor,
        command('schedule.toggle', { scheduleId: created.id, enabled }, t.f.projectId, version),
      );
    toggle(false, created.version);
    t.clock.now = utc('2026-10-06T00:00:00Z');
    expect(tickSchedules(t.f.control.ctx)).toBe(0);
    toggle(true, created.version + 1);
    expect(tickSchedules(t.f.control.ctx)).toBe(0);
    expect(t.works()).toHaveLength(0);
    expect(() =>
      t.create({ spec: { kind: 'daily', time: '09:00' }, timezone: 'Mars/Base' }),
    ).toThrow('SCHEDULE_TIMEZONE_INVALID');
    expect(() => t.create({ spec: { kind: 'once', at: utc('2020-01-01T00:00:00Z') } })).toThrow(
      'SCHEDULE_IN_THE_PAST',
    );
    expect(() =>
      t.f.control.execute(
        t.f.sender.actor,
        command(
          'schedule.create',
          { name: 'x', template, spec: { kind: 'daily', time: '09:00' } },
          t.f.projectId,
        ),
      ),
    ).toThrow('FORBIDDEN');
  } finally {
    t.f.control.close();
    rmSync(t.directory, { recursive: true, force: true });
  }
});
