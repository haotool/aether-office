import {
  REMEMBERED_SESSION_MS,
  activeOwnerId,
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
      .strictObject({ token: z.string().min(32).max(256), remember: z.boolean().optional() })
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

const LOOPBACK_ADDRESSES: ReadonlySet<string> = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const FORWARDING_HEADERS = [
  'forwarded',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-proto',
];

function thisMachine(
  request: FastifyRequest,
  { options, origin }: Pick<RouteContext, 'options' | 'origin'>,
) {
  return (
    !!options.localSignIn &&
    !options.trustProxy &&
    LOOPBACK_ADDRESSES.has(request.raw.socket.remoteAddress ?? '') &&
    request.headers.host === origin.host &&
    request.headers.origin === origin.origin &&
    FORWARDING_HEADERS.every((name) => request.headers[name] === undefined)
  );
}

function localRoute(context: RouteContext, { startCookie }: Guards) {
  const { app, control } = context;
  app.post('/api/login/local', async (request, reply) => {
    if (!thisMachine(request, context)) return { available: false };
    const owner = activeOwnerId(control.ctx);
    if (!owner) return { available: false };
    const session = openSession(
      control.ctx,
      identityActor(control.ctx, owner),
      REMEMBERED_SESSION_MS,
    );
    startCookie(request, reply, session.session, REMEMBERED_SESSION_MS);
    request.log.info({ event: 'session.local' }, 'this computer signed in without a token');
    return {
      available: true,
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
  app.post('/api/pairings', async (request) => {
    const who = actor(request);
    if (!['owner', 'operator'].includes(who.role)) throw new DomainError('FORBIDDEN', 403);
    const made = pairings.create(who.id);
    // Without LAN access the one link is for this machine (`pnpm go` opens it).
    const origins = options.lan
      ? (options.lanAddresses ?? lanOrigins)(origin.port)
      : [origin.origin];
    return {
      id: made.id,
      expiresAt: made.expiresAt,
      ttlSeconds: PAIRING_TTL_MS / 1000,
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
    const { code } = z.strictObject({ code: z.string().min(16).max(64) }).parse(request.body);
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
  // A page that lost its CSRF token (a closed or iOS-discarded tab) may ask for a new one. The session cookie is the
  // credential, so a bearer token never counts; a cross-site page can neither send the cookie nor read the answer.
  app.post('/api/session/csrf', async (request) => {
    if (request.headers['authorization']) throw new DomainError('COOKIE_SESSION_REQUIRED', 403);
    if (!request.headers.origin) throw new DomainError('ORIGIN_FORBIDDEN', 403);
    const session = request.cookies['aether_session'];
    if (!session) throw new DomainError('AUTH_REQUIRED', 401);
    sessionActor(control.ctx, session);
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

export function authRoutes(context: RouteContext) {
  const guards = signInGuards(context);
  loginRoute(context, guards);
  localRoute(context, guards);
  pairingRoutes(context, guards);
  sessionRoutes(context, guards);
}
