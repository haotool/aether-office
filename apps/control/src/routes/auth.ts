import {
  REMEMBERED_SESSION_MS,
  hash,
  identityActor,
  login,
  openSession,
  rotateCsrf,
  sessionActor,
} from '../services/domain/identity.js';
import { MAX_ATTEMPTS, pruneAttempts } from '../services/runtime/attempts.js';
import { PAIRING_TTL_MS, lanOrigins, pairingLinks } from '../services/remote/pairing.js';
import { DomainError } from '@aether/kernel';
import { z } from 'zod';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { RouteContext } from './context.js';

type Guards = ReturnType<typeof signInGuards>;

/** The session cookie a sign-in sets, and the per-caller limit on failed sign-ins. */
function signInGuards({ control, origin, attempts }: RouteContext) {
  // `request.protocol` is https only when a proxy that is trusted (AETHER_TRUST_PROXY) says it terminated TLS.
  const startCookie = (
    request: FastifyRequest,
    reply: FastifyReply,
    session: string,
    ttlMs: number,
  ) =>
    reply.setCookie('aether_session', session, {
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: origin.protocol === 'https:' || request.protocol === 'https',
      maxAge: Math.floor(ttlMs / 1000),
    });
  /** Counts failed attempts per caller: the same limit for a typed token and a scanned code. */
  const limited = (key: string) => {
    const now = control.ctx.now();
    const last = attempts.get(key);
    if (last && last.until > now && last.count >= 10)
      throw new DomainError('LOGIN_RATE_LIMIT', 429);
    if (attempts.size >= MAX_ATTEMPTS) pruneAttempts(attempts, now);
    attempts.set(key, {
      count: last && last.until > now ? last.count + 1 : 1,
      until: last && last.until > now ? last.until : now + 300000,
    });
  };
  return { startCookie, limited };
}

function loginRoute({ app, control, attempts }: RouteContext, { startCookie, limited }: Guards) {
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
    startCookie(request, reply, session.session, ttl ?? 8 * 60 * 60 * 1000);
    return {
      actor: session.actor,
      csrf: session.csrf,
      expiresAt: session.expiresAt,
      mode: control.ctx.mode,
    };
  });
}

function pairingRoutes(
  { app, control, origin, options, attempts, pairings, actor }: RouteContext,
  { startCookie, limited }: Guards,
) {
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
    startCookie(request, reply, session.session, REMEMBERED_SESSION_MS);
    request.log.info({ event: 'pairing.redeemed' }, 'a device was paired');
    return {
      actor: session.actor,
      csrf: session.csrf,
      expiresAt: session.expiresAt,
      mode: control.ctx.mode,
    };
  });
}

function sessionRoutes({ app, control, actor }: RouteContext, { limited }: Guards) {
  app.get('/api/session', async (request) => ({ actor: actor(request), mode: control.ctx.mode }));
  // A page that is signed in but lost its CSRF token (a closed tab, an iOS-discarded tab) asks for a new one. The session
  // cookie is the credential (HttpOnly, SameSite=Strict, the Host and Origin checks of every request), so a bearer token
  // never counts, and the request must name its Origin: a cross-site page cannot send the cookie nor read the answer.
  app.post('/api/session/csrf', async (request) => {
    if (request.headers['authorization']) throw new DomainError('COOKIE_SESSION_REQUIRED', 403);
    if (!request.headers.origin) throw new DomainError('ORIGIN_FORBIDDEN', 403);
    const session = request.cookies['aether_session'];
    if (!session) throw new DomainError('AUTH_REQUIRED', 401);
    sessionActor(control.ctx, session); // an unknown or expired session is a 401 and is not counted below
    limited(`csrf:${request.ip}`);
    const rotated = rotateCsrf(control.ctx, session);
    request.log.info({ event: 'session.csrf.rotated' }, 'a browser session got a new CSRF token');
    return rotated;
  });
  app.post('/api/logout', async (request, reply) => {
    actor(request);
    const token = request.cookies['aether_session'];
    if (token)
      control.ctx.sqlite.prepare('DELETE FROM browser_sessions WHERE tokenHash=?').run(hash(token));
    reply.clearCookie('aether_session', { path: '/' });
    return { ok: true };
  });
}

/** Browser sign-in: a token becomes a cookie session; the session endpoint tells the page who it is. */
export function authRoutes(context: RouteContext) {
  const guards = signInGuards(context);
  loginRoute(context, guards);
  pairingRoutes(context, guards);
  sessionRoutes(context, guards);
}
