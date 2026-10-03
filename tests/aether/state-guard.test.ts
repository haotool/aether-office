import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { TRANSITIONS, type WorkState } from '../../packages/kernel/src/index.js';
import { command, fixture } from './fixture.js';

it('the database refuses exactly the work-state transitions the kernel refuses', () => {
  const f = fixture();
  try {
    const sql = f.control.ctx.sqlite;
    const templateId = String(
      f.control.execute(
        f.owner.actor,
        command('work.create', { title: 'Guarded', description: '', acceptance: 'x' }, f.projectId),
      ).result['id'],
    );
    const columns = (sql.pragma('table_info(work_items)') as { name: string }[]).map((c) => c.name);
    const copy = columns.map((c) => (c === 'id' ? '?' : c === 'state' ? '?' : c)).join(',');
    const insert = sql.prepare(
      `INSERT INTO work_items(${columns.join(',')}) SELECT ${copy} FROM work_items WHERE id=?`,
    );
    const all = Object.keys(TRANSITIONS) as WorkState[];
    for (const from of all) {
      for (const to of all) {
        if (from === to) continue;
        const id = randomUUID();
        insert.run(id, from, templateId); // INSERT bypasses the UPDATE trigger, giving a row in `from`
        const attempt = () => sql.prepare('UPDATE work_items SET state=? WHERE id=?').run(to, id);
        const allowed = (TRANSITIONS[from] as readonly string[]).includes(to);
        if (allowed) expect(attempt, `${from}->${to}`).not.toThrow();
        else expect(attempt, `${from}->${to}`).toThrow('INVALID_TRANSITION');
      }
    }
  } finally {
    f.control.close();
  }
});
