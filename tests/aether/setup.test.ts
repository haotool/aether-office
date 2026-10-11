import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Control } from '../../apps/control/src/control.js';
import { expect, it } from 'vitest';
import { setup } from '../../scripts/setup.js';

const count = (file: string, table: string) => {
  const control = new Control(file, { mode: 'demo' });
  try {
    return (control.ctx.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number })
      .n;
  } finally {
    control.close();
  }
};

it('setup --demo can be re-run without duplicating the demo or touching existing data and credentials', () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-setup-'));
  const db = join(directory, 'control.sqlite');
  try {
    expect(setup('demo', directory).projects).toBe(1);
    const token = readFileSync(join(directory, 'owner-token'), 'utf8');
    const runnerToken = readFileSync(join(directory, 'runner-token'), 'utf8');
    const before = {
      projects: count(db, 'projects'),
      agents: count(db, 'agents'),
      work: count(db, 'work_items'),
      migrations: count(db, 'schema_migrations'),
      identities: count(db, 'identities'),
    };
    expect(before).toMatchObject({ projects: 1, agents: 12, work: 2 });

    for (let i = 0; i < 3; i++) setup('demo', directory);
    expect({
      projects: count(db, 'projects'),
      agents: count(db, 'agents'),
      work: count(db, 'work_items'),
      migrations: count(db, 'schema_migrations'),
      identities: count(db, 'identities'),
    }).toEqual(before);
    expect(readFileSync(join(directory, 'owner-token'), 'utf8')).toBe(token);
    expect(readFileSync(join(directory, 'runner-token'), 'utf8')).toBe(runnerToken);
    expect(statSync(join(directory, 'owner-token')).mode & 0o777).toBe(0o600);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it("re-running against a data directory that already holds the user's own project leaves it alone", () => {
  const directory = mkdtempSync(join(tmpdir(), 'aether-setup-live-'));
  try {
    setup('live', directory);
    expect(count(join(directory, 'control.sqlite'), 'projects')).toBe(0);
    setup('live', directory);
    expect(count(join(directory, 'control.sqlite'), 'identities')).toBe(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
