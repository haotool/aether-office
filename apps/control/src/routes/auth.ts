import {
  REMEMBERED_SESSION_MS,
  hash,
  identityActor,
  login,
  openSession,
} from '../services/identity.js';
import { PAIRING_TTL_MS, lanOrigins, pairingLinks } from '../services/pairing.js';
import { DomainError } from '@aether/kernel';
import { z } from 'zod';
import type { FastifyReply } from 'fastify';
import type { RouteContext } from './context.js';

/** Browser sign-in: a token becomes a cookie session; the session endpoint tells the page who it is. */
export function authRoutes({
  app,
  control,
  origin,
  options,
  attempts,
  pairings,
  actor,
}: RouteContext) {
  const startCookie = (reply: FastifyReply, session: string, ttlMs: number) =>
    reply.setCookie('aether_session', session, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: origin.protocol === 'https:',
      maxAge: Math.floor(ttlMs / 1000),
    });
  /** Counts failed attempts per caller: the same limit for a typed token and a scanned code. */
  const limited = (key: string) => {
    const now = control.ctx.now();
    const last = attempts.get(key);
    if (last && last.until > now && last.count >= 10)
      throw new DomainError('LOGIN_RATE_LIMIT', 429);
    if (attempts.size > 1000) for (const [k, v] of attempts) if (v.until <= now) attempts.delete(k);
    attempts.set(key, {
      count: last && last.until > now ? last.count + 1 : 1,
      until: last && last.until > now ? last.until : now + 300000,
    });
  };
  app.post('/api/login', async (request, reply) => {
    const key = request.ip;
    limited(key);
    const { token, remember } = z
      .object({ token: z.string().min(32).max(256), remember: z.boolean().optional() })
      .strict()
      .parse(request.body);
    const ttl = remember ? REMEMBERED_SESSION_MS : undefined;
    const session = login(control.ctx, token, ttl);
    attempts.delete(key);
    startCookie(reply, session.session, ttl ?? 8 * 60 * 60 * 1000);
    return {
      actor: session.actor,
      csrf: session.csrf,
      expiresAt: session.expiresAt,
      mode: control.ctx.mode,
    };
  });
  // Signing a phone in by scanning (services/pairing.ts): a signed-in person asks for a code; the phone redeems it once.
  app.post('/api/pairings', async (request) => {
    const who = actor(request);
    if (!['owner', 'operator'].includes(who.role)) throw new DomainError('FORBIDDEN', 403);
    const made = pairings.create(who.id);
    const origins = options.lan ? (options.lanAddresses ?? lanOrigins)(origin.port) : [];
    return {
      id: made.id,
      expiresAt: made.expiresAt,
      ttlSeconds: PAIRING_TTL_MS / 1000,
      // Without LAN access there is no address a phone could reach: the page says how to turn it on.
      lan: !!options.lan,
      links: await pairingLinks(origins, made.code),
    };
  });
  app.get('/api/pairings/:id', async (request) => {
    const who = actor(request);
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    return { status: pairings.status(id, who.id) };
  });
  app.post('/api/pairings/redeem', async (request, reply) => {
    const key = request.ip;
    limited(key);
    const { code } = z
      .object({ code: z.string().min(16).max(64) })
      .strict()
      .parse(request.body);
    const session = openSession(
      control.ctx,
      identityActor(control.ctx, pairings.redeem(code)),
      REMEMBERED_SESSION_MS,
    );
    attempts.delete(key);
    startCookie(reply, session.session, REMEMBERED_SESSION_MS);
    request.log.info({ event: 'pairing.redeemed' }, 'a device was paired');
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
