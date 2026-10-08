import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from '../../apps/control/src/server.js';
import { revoke } from '../../apps/control/src/services/domain/identity.js';
import { command, fixture } from './fixture.js';
import { injectHost, injectOrigin } from './test-origins.js';
const clean: (() => void | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const fn of clean.splice(0).reverse()) await fn();
});
function setup() {
  const f = fixture();
  clean.push(() => f.control.close());
  const app = createServer(f.control, { origin: injectOrigin });
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
    const host = { host: injectHost };
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
    const host = { host: injectHost };
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
  it('a signed-in browser whose page lost its CSRF token gets a new one, and the old one stops working', async () => {
    const f = setup();
    const host = { host: injectHost };
    const login = await f.app.inject({
      method: 'POST',
      url: '/api/login',
      headers: host,
      payload: { token: f.owner.token },
    });
    const cookie = login.cookies[0]!;
    const old = (login.json() as { csrf: string }).csrf;
    const headers = { ...host, cookie: `${cookie.name}=${cookie.value}` };
    const rotate = (extra: Record<string, string> = {}) =>
      f.app.inject({
        method: 'POST',
        url: '/api/session/csrf',
        headers: { ...headers, origin: injectOrigin, ...extra },
        payload: {},
      });
    const write = (csrf: string) =>
      f.app.inject({
        method: 'POST',
        url: '/api/commands',
        headers: { ...headers, 'x-csrf-token': csrf },
        payload: command('project.create', { name: 'After rotation' }),
      });
    // the cookie alone is the credential, and only for a request that says where it came from
    const noOrigin = await f.app.inject({
      method: 'POST',
      url: '/api/session/csrf',
      headers,
      payload: {},
    });
    expect(noOrigin.statusCode).toBe(403);
    expect((await rotate({ origin: 'https://evil.example' })).statusCode).toBe(403);
    expect((await rotate({ authorization: `Bearer ${f.owner.token}` })).statusCode).toBe(403);
    expect(
      (
        await f.app.inject({
          method: 'POST',
          url: '/api/session/csrf',
          headers: { ...host, origin: injectOrigin },
          payload: {},
        })
      ).statusCode,
    ).toBe(401); // no cookie
    expect((await write(old)).statusCode).toBe(200); // nothing above changed the token
    const rotated = await rotate();
    expect(rotated.statusCode).toBe(200);
    const { csrf, expiresAt } = rotated.json() as { csrf: string; expiresAt: number };
    expect(csrf).not.toBe(old);
    expect(expiresAt).toBeGreaterThan(Date.now());
    expect(rotated.body).not.toContain(cookie.value);
    expect((await write(old)).statusCode).toBe(403); // the old token is dead
    expect((await write(csrf)).statusCode).toBe(200);
    for (let i = 1; i < 10; i++) expect((await rotate()).statusCode).toBe(200);
    expect((await rotate()).statusCode).toBe(429); // rate limited like a login
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
    const headers = { host: injectHost, authorization: `Bearer ${f.owner.token}` };
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

  it('limits how often one address may call the liveness probe', async () => {
    const f = setup();
    const probe = () => f.app.inject({ url: '/health', headers: { host: injectHost } });
    for (let i = 0; i < 120; i++) expect((await probe()).statusCode).toBe(200);
    const limited = await probe();
    expect(limited.statusCode).toBe(429);
    expect(limited.json()).toMatchObject({ error: { code: 'HEALTH_RATE_LIMIT' } });
  });
});
