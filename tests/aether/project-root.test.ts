import { chmodSync, mkdirSync, mkdtempSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { command, fixture } from './fixture.js';

it('answers a project folder that is missing, not a folder, or unreadable with a 400 and a stable code', async () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'aether-project-root-')));
  const file = join(dir, 'file.txt');
  writeFileSync(file, 'x');
  const locked = join(dir, 'locked');
  mkdirSync(locked);
  chmodSync(locked, 0o000);
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4701' });
  const create = (root: string) =>
    app.inject({
      method: 'POST',
      url: '/api/commands',
      headers: {
        host: '127.0.0.1:4701',
        authorization: `Bearer ${f.owner.token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify(command('project.create', { name: 'p', root })),
    });
  const code = (res: { json(): unknown }) => (res.json() as { error: { code: string } }).error.code;
  try {
    const missing = await create(join(dir, 'nope'));
    expect(missing.statusCode).toBe(400);
    expect(code(missing)).toBe('PROJECT_ROOT_NOT_FOUND');
    for (const bad of [file, locked]) {
      const res = await create(bad);
      expect(res.statusCode).toBe(400);
      expect(code(res)).toBe('PROJECT_ROOT_INVALID');
    }
    expect((await create(dir)).statusCode).toBe(200);
  } finally {
    chmodSync(locked, 0o700);
    await app.close();
  }
});
