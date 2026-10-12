import { expect, it } from 'vitest';
import { command, fixture } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';

it('requires a new snapshot when the cursor predates retained events, instead of silently skipping', async () => {
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4491' });
  try {
    for (const title of ['one', 'two', 'three', 'four'])
      f.control.execute(
        f.owner.actor,
        command('work.create', { title, description: '', acceptance: 'x' }, f.projectId),
      );
    const all = f.control.events(f.owner.actor, f.projectId, '0', 200);
    expect(all.length).toBeGreaterThan(4);
    const cutoff = all[2]!.seq;
    f.control.ctx.sqlite
      .prepare(
        'DELETE FROM outbox WHERE eventId IN (SELECT eventId FROM events WHERE seq<=CAST(? AS INTEGER))',
      )
      .run(cutoff);
    f.control.ctx.sqlite.prepare('DELETE FROM events WHERE seq<=CAST(? AS INTEGER)').run(cutoff);

    expect(() => f.control.events(f.owner.actor, f.projectId, all[0]!.seq)).toThrow(
      'SNAPSHOT_REQUIRED',
    );
    expect(f.control.events(f.owner.actor, f.projectId, cutoff)[0]!.seq).toBe(all[3]!.seq);
    expect(f.control.events(f.owner.actor, f.projectId, '0').length).toBeGreaterThan(0);

    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${f.projectId}/stream?after=${all[0]!.seq}`,
      headers: { authorization: `Bearer ${f.owner.token}`, host: '127.0.0.1:4491' },
    });
    expect(response.statusCode).toBe(410);
    expect(response.json().error.code).toBe('SNAPSHOT_REQUIRED');
    expect(() => f.control.events(f.owner.actor, f.projectId, 'not-a-number')).toThrow(
      'INVALID_CURSOR',
    );
  } finally {
    await app.close();
    f.control.close();
  }
});
