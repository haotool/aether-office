import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { fixture } from './fixture.js';

const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});

it('lets only an owner ask for a nudge, and only for a session that exists, named properly', async () => {
  process.env['AETHER_LOCAL_SESSIONS_HOME'] = realpathSync(
    mkdtempSync(join(tmpdir(), 'aether-reap-')),
  );
  const f = fixture();
  clean.push(() => f.control.close());
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4504' });
  clean.push(() => app.close());
  const viewer = f.control.createIdentity(f.owner.actor, {
    name: 'Viewer',
    role: 'viewer',
    projectIds: [f.projectId],
  });
  const call = (token: string, key: string) =>
    app.inject({
      method: 'POST',
      url: `/api/local-sessions/${encodeURIComponent(key)}/reap-zombies`,
      headers: {
        host: '127.0.0.1:4504',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify({ startedAt: 1 }),
    });
  expect((await call(viewer.token, 'claude:abc')).statusCode).toBe(403);
  expect((await call(f.owner.token, 'not a key')).statusCode).toBe(400);
  expect((await call(f.owner.token, 'claude:abc')).statusCode).toBe(404);
});
