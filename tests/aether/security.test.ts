import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { revoke } from '../../apps/control/src/services/identity.js';
import { command, fixture } from './fixture.js';
const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});
function setup() {
  const f = fixture();
  clean.push(() => f.control.close());
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4310' });
  clean.push(() => app.close());
  return { ...f, app };
}
describe('server trust boundaries', () => {
  it('rejects missing auth, forged Host/Origin and viewer mutations', async () => {
    const f = setup();
    const viewer = f.control.createIdentity(f.owner.actor, {
      name: 'Viewer',
      role: 'viewer',
      projectIds: [f.projectId],
    });
    const host = { host: '127.0.0.1:4310' };
    expect((await f.app.inject({ url: '/api/projects', headers: host })).statusCode).toBe(401);
    expect(
      (
        await f.app.inject({
          url: '/api/projects',
          headers: { ...host, host: 'evil.example', authorization: `Bearer ${f.owner.token}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          url: '/api/projects',
          headers: {
            ...host,
            origin: 'https://evil.example',
            authorization: `Bearer ${f.owner.token}`,
          },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/commands',
          headers: { ...host, authorization: `Bearer ${viewer.token}` },
          payload: command(
            'work.create',
            { title: 'forbidden', description: '', acceptance: 'x' },
            f.projectId,
          ),
        })
      ).statusCode,
    ).toBe(403);
  });
  it('cookie mutation requires CSRF; logout invalidates the existing session', async () => {
    const f = setup();
    const host = { host: '127.0.0.1:4310' };
    const login = await f.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: host,
      payload: { token: f.owner.token },
    });
    expect(login.statusCode).toBe(200);
    const cookie = login.cookies[0]!;
    expect(cookie.httpOnly).toBe(true);
    const headers = { ...host, cookie: `${cookie.name}=${cookie.value}` };
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/commands',
          headers,
          payload: command('project.create', { name: 'CSRF attack' }),
        })
      ).statusCode,
    ).toBe(403);
    const csrf = (login.json() as { csrf: string }).csrf;
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/logout',
          headers: { ...headers, 'x-csrf-token': csrf },
        })
      ).statusCode,
    ).toBe(200);
    expect((await f.app.inject({ url: '/api/session', headers })).statusCode).toBe(401);
  });
  it('does not accept sender spoofing, foreign inbox access, cursor scope substitution, or revoked identity', () => {
    const f = setup();
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command(
          'message.send',
          { senderId: f.recipientId, recipients: [f.recipientId], body: 'spoof' },
          f.projectId,
        ),
      ),
    ).toThrow();
    f.send('a');
    f.send('b');
    const page = f.control.inbox(f.recipient.actor, f.projectId, {
      recipientId: f.recipientId,
      limit: 1,
    });
    expect(() =>
      f.control.inbox(f.sender.actor, f.projectId, { recipientId: f.recipientId }),
    ).toThrow('RECIPIENT_FORBIDDEN');
    expect(() =>
      f.control.inbox(f.owner.actor, f.projectId, {
        recipientId: f.senderId,
        cursor: page.nextCursor,
      }),
    ).toThrow('CURSOR_SCOPE_MISMATCH');
    expect(() =>
      f.control.inbox(f.recipient.actor, f.projectId, {
        recipientId: f.recipientId,
        cursor: page.nextCursor + 'x',
      }),
    ).toThrow('INVALID_CURSOR');
    revoke(f.control.ctx, f.owner.actor, f.recipient.actor.id);
    expect(() =>
      f.control.inbox(f.recipient.actor, f.projectId, { recipientId: f.recipientId }),
    ).toThrow('AUTH_REQUIRED');
  });
  it('caps payload size and refuses unknown command fields', async () => {
    const f = setup();
    const headers = { host: '127.0.0.1:4310', authorization: `Bearer ${f.owner.token}` };
    const huge = await f.app.inject({
      method: 'POST',
      url: '/api/commands',
      headers,
      payload: { body: 'x'.repeat(150000) },
    });
    expect(huge.statusCode).toBe(413);
    const forged = await f.app.inject({
      method: 'POST',
      url: '/api/commands',
      headers,
      payload: { ...command('project.create', { name: 'p' }), actorId: 'other' },
    });
    expect(forged.statusCode).toBe(400);
  });
});
