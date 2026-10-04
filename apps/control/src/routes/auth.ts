import { hash, login } from '../services/identity.js';
import { DomainError } from '@aether/kernel';
import { z } from 'zod';
import type { RouteContext } from './context.js';

/** Browser sign-in: a token becomes a cookie session; the session endpoint tells the page who it is. */
export function authRoutes({ app, control, origin, attempts, actor }: RouteContext) {
  app.post('/api/login', async (request, reply) => {
    const key = request.ip;
    const now = control.ctx.now();
    const last = attempts.get(key);
    if (last && last.until > now && last.count >= 10)
      throw new DomainError('LOGIN_RATE_LIMIT', 429);
    if (attempts.size > 1000) for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    attempts.set(key, {
      count: last && last.until > now ? last.count + 1 : 1,
      until: last && last.until > now ? last.until : now + 300000,
    });
    const { token } = z
      .object({ token: z.string().min(32).max(256) })
      .strict()
      .parse(request.body);
    const session = login(control.ctx, token);
    attempts.delete(key);
    reply.setCookie('aether_session', session.session, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: origin.protocol === 'https:',
      maxAge: 28800,
    });
    return {
      actor: session.actor,
      csrf: session.csrf,
      expiresAt: session.expiresAt,
      mode: control.ctx.mode,
    };
  });
  app.get('/api/session', async (request) => ({ actor: actor(request), mode: control.ctx.mode }));
  app.post('/api/logout', async (request, reply) => {
    actor(request);
    const token = request.cookies['aether_session'];
    if (token)
      control.ctx.sqlite.prepare('DELETE FROM browser_sessions WHERE tokenHash=?').run(hash(token));
    reply.clearCookie('aether_session', { path: '/' });
    return { ok: true };
  });
}
