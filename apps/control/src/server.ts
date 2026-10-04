import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { DomainError, type Actor } from '@aether/kernel';
import { hostPolicy } from './services/host-policy.js';
import { sessionActor } from './services/identity.js';
import { refreshMessageWaits } from './services/messages.js';
import { tickSchedules } from './services/schedules.js';
import type { Control } from './control.js';
import type { AuthInput, RouteContext, ServerOptions } from './routes/context.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { externalRoutes } from './routes/external.js';
import { localRoutes } from './routes/local.js';
import { projectListRoutes } from './routes/project-lists.js';
import { projectRoutes } from './routes/project.js';
import { runnerRoutes } from './routes/runner.js';
import { workRoutes } from './routes/work.js';

/** Routes that answer without a session or bearer token, and why. Everything else under /api requires one. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  'GET /health',
  'POST /api/login',
  'GET /api/session', // answers 401 itself
  'POST /api/runner/enroll', // the single-use invitation is the credential
  'POST /api/webhooks/github/:integrationId', // authenticated by HMAC signature
  'GET /.well-known/agent-card.json', // public by the A2A spec
  'POST /a2a', // its own bearer scheme
]);

export function createServer(control: Control, options: ServerOptions) {
  const origin = new URL(options.origin);
  const policy = hostPolicy(origin, options.lan ?? false);
  const app = Fastify({
    bodyLimit: 128 * 1024,
    logger: options.logger
      ? {
          ...(options.logStream ? { stream: options.logStream } : {}),
          redact: [
            'req.headers.authorization',
            'req.headers.cookie',
            'res.headers.set-cookie',
            'token',
            'password',
          ],
        }
      : false,
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: false,
  });
  const streams = new Set<() => void>();
  if (options.routeLog)
    app.addHook('onRoute', (route) => {
      for (const method of [route.method].flat())
        if (method !== 'HEAD' && method !== 'OPTIONS')
          options.routeLog!.push({ method, url: route.url });
    });
  let waitTimer: ReturnType<typeof setInterval> | undefined;
  app.addHook('onReady', async () => {
    refreshMessageWaits(control.ctx);
    tickSchedules(control.ctx); // catches up after a restart: one occurrence at most, never a burst
    waitTimer = setInterval(() => {
      try {
        refreshMessageWaits(control.ctx);
      } catch {
        app.log.error('MESSAGE_WAIT_RECONCILIATION_FAILED');
      }
      try {
        tickSchedules(control.ctx);
      } catch {
        app.log.error('SCHEDULE_TICK_FAILED');
      }
    }, 1000);
    waitTimer.unref();
  });

  app.addHook('preClose', async () => {
    clearInterval(waitTimer);
    for (const close of streams) close();
  });
  app.register(cookie);
  const attempts = new Map<string, { count: number; until: number }>();
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('x-frame-options', 'DENY');
    reply.header(
      'content-security-policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
    );
    if (!policy.host(request.headers.host)) throw new DomainError('HOST_FORBIDDEN', 403);
    if (!policy.origin(request.headers.origin)) throw new DomainError('ORIGIN_FORBIDDEN', 403);
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });
  function actor(request: AuthInput): Actor {
    const authorization = request.headers['authorization'];
    if (typeof authorization === 'string' && authorization.startsWith('Bearer '))
      return control.authenticate(authorization.slice(7));
    const session = request.cookies['aether_session'];
    if (!session) throw new DomainError('AUTH_REQUIRED', 401);
    const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const csrf = request.headers['x-csrf-token'];
    return sessionActor(
      control.ctx,
      session,
      mutation ? (typeof csrf === 'string' ? csrf : '') : undefined,
    );
  }
  // Authenticate before any handler parses or validates input, so a route can never forget to.
  app.addHook('preHandler', async (request) => {
    const url = request.routeOptions.url ?? '';
    if (url.startsWith('/api/') && !PUBLIC_ROUTES.has(`${request.method} ${url}`)) actor(request);
  });
  // API answers are JSON and compress about tenfold; a phone on Wi-Fi waits for the bytes, not for the CPU.
  app.addHook('onSend', async (request, reply, payload) => {
    if (typeof payload !== 'string' && !Buffer.isBuffer(payload)) return payload; // streams are left alone
    const type = String(reply.getHeader('content-type') ?? '');
    const encoding = String(request.headers['accept-encoding'] ?? '');
    if (!type.includes('json') || !/\bgzip\b/.test(encoding) || reply.getHeader('content-encoding'))
      return payload;
    if (Buffer.byteLength(payload) < 1024) return payload;
    reply.header('content-encoding', 'gzip').header('vary', 'accept-encoding');
    return gzipSync(payload, { level: 4 });
  });
  app.setErrorHandler((error, request, reply) => {
    const e = error as Error & { statusCode?: number };
    const status =
      e instanceof DomainError
        ? e.status
        : e instanceof z.ZodError
          ? 400
          : e.statusCode === 413
            ? 413
            : 500;
    const code =
      e instanceof DomainError
        ? e.code
        : e instanceof z.ZodError
          ? 'INVALID_REQUEST'
          : status === 413
            ? 'PAYLOAD_TOO_LARGE'
            : 'INTERNAL_ERROR';
    // Do not log user payloads, arbitrary error messages or paths from failed filesystem access.
    if (status === 500)
      request.log.error({ code, correlationId: request.id, errorName: e.name }, 'request failed');
    reply.code(status).send({
      error: { code, safeMessage: code, correlationId: request.id, retryable: status >= 500 },
    });
  });
  app.get('/health', async () => ({
    status: 'ok',
    mode: control.ctx.mode,
    version: '0.4.0-dev.0',
  }));
  const routes: RouteContext = { app, control, options, origin, actor, attempts, streams };
  authRoutes(routes);
  projectRoutes(routes);
  projectListRoutes(routes);
  workRoutes(routes);
  runnerRoutes(routes);
  localRoutes(routes);
  externalRoutes(routes);
  adminRoutes(routes);
  if (options.serveWeb) {
    const root = fileURLToPath(new URL('../../web/dist/', import.meta.url));
    if (!existsSync(root)) throw new Error('WEB_BUILD_REQUIRED');
    app.register(staticFiles, {
      root,
      wildcard: true,
      preCompressed: true, // the build leaves a .br and a .gz beside each text and model file
      setHeaders: (response, served) => {
        const path = served.replace(/\.(br|gz)$/, ''); // the pre-compressed copy is served under its own name
        // Files whose name carries a content hash never change; the characters keep their names, so they are
        // revalidated daily; the page itself is always asked for.
        const cache = /[\\/]assets[\\/][^\\/]+-[\w-]{8}\.(js|css)$/.test(path)
          ? 'public, max-age=31536000, immutable'
          : /[\\/]animals[\\/]/.test(path)
            ? 'public, max-age=86400, stale-while-revalidate=604800'
            : path.endsWith('index.html')
              ? 'no-cache'
              : null;
        if (cache) response.header('cache-control', cache);
      },
    });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/') || request.url.startsWith('/assets/')
        ? reply.code(404).send({ error: { code: 'NOT_FOUND', correlationId: request.id } })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}
