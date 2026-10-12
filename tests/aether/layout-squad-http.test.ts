import { expect, it } from 'vitest';
import type { Layout } from '../../packages/contracts/src/index.js';
import { createServer } from '../../apps/control/src/server.js';
import { defaultLayout } from '../../packages/office-scene/src/environment/layout.js';
import { squadLayout, squadObjectOf } from '../../packages/office-scene/src/squad/squad-layout.js';
import { command, fixture } from './fixture.js';

const host = 'localhost';

it('stores a version 1 layout as sent, accepts a squad as version 2 and refuses a broken one', async () => {
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://localhost' });
  const headers = { host, authorization: `Bearer ${f.owner.token}` };
  const save = (data: unknown, version: number) =>
    app.inject({
      method: 'POST',
      url: '/api/commands',
      headers: { ...headers, 'content-type': 'application/json' },
      payload: JSON.stringify(command('layout.save', data, f.projectId, version)),
    });
  const stored = async () =>
    (await app.inject({ url: `/api/projects/${f.projectId}/snapshot`, headers })).json().layout as {
      version: number;
      data: Layout;
    };
  try {
    const v1 = defaultLayout([]);
    expect((await save(v1, 0)).statusCode).toBe(200);
    expect(JSON.stringify((await stored()).data)).toBe(JSON.stringify(v1));

    const zone = squadLayout(v1, 'desk-3', 4)!;
    const v2: Layout = {
      ...v1,
      schemaVersion: 2,
      objects: [...v1.objects, squadObjectOf(zone, 'squad-1', 2)],
    };
    expect((await save(v2, 1)).statusCode).toBe(200);
    expect(JSON.stringify((await stored()).data)).toBe(JSON.stringify(v2));

    const missingAnchor = await save(
      {
        ...v2,
        objects: [...v1.objects, { ...squadObjectOf(zone, 'squad-1'), anchor: 'desk-nope' }],
      },
      2,
    );
    expect(missingAnchor.statusCode).toBe(400);
    expect(JSON.stringify(missingAnchor.json())).toContain('LAYOUT_SQUAD_ANCHOR');
    expect((await save({ ...v2, schemaVersion: 1 }, 2)).statusCode).toBe(400);
    expect((await save({ ...v2, schemaVersion: 3 }, 2)).statusCode).toBe(400);
    expect((await stored()).version).toBe(2);
  } finally {
    await app.close();
    f.control.close();
  }
});
