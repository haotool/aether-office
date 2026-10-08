import type { FastifyInstance } from 'fastify';
import staticFiles from '@fastify/static';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { z } from 'zod';
import { DomainError, type Actor } from '@aether/kernel';
import type { Control } from './control.js';
import type { hostPolicy } from './services/platform/host-policy.js';
import { sessionActor } from './services/domain/identity.js';
import { refreshMessageWaits } from './services/domain/messages.js';
import { tickSchedules } from './services/domain/schedules.js';
import { pruneAttempts } from './services/runtime/attempts.js';
import { pruneRetention } from './services/domain/retention.js';
import type { AuthInput, RouteContext } from './routes/context.js';

const RETENTION_INTERVAL_MS = 60 * 60 * 1000;

/** The reads that carry an ETag: the session list, its speech and one session's transcript (not the stream). */
const REVALIDATED = /^\/api\/(?:local-sessions(?:\/speech|\/[^/]+\/transcript)?|usage(?:\/git)?)$/;

const CONTENT_SECURITY_POLICY =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' blob:; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'none'";

/** The periodic work (retention, message waits, schedules) starts when the server is ready and stops when it closes. */
export function runHousekeeping(
  app: FastifyInstance,
  control: Control,
  attempts: RouteContext['attempts'],
  streams: ReadonlySet<() => void>,
) {
  let waitTimer: ReturnType<typeof setInterval> | undefined;
  let retentionTimer: ReturnType<typeof setInterval> | undefined;
  const prune = () => {
    try {
      pruneRetention(control.ctx);
    } catch {
      app.log.error('RETENTION_PRUNE_FAILED');
    }
  };
  app.addHook('onReady', async () => {
    prune();
    retentionTimer = setInterval(prune, RETENTION_INTERVAL_MS);
    retentionTimer.unref();
    refreshMessageWaits(control.ctx);
    tickSchedules(control.ctx); // catches up after a restart: one occurrence at most, never a burst
    waitTimer = setInterval(() => {
      pruneAttempts(attempts, control.ctx.now());
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
    clearInterval(retentionTimer);
    for (const close of streams) close();
  });
}

/** Security headers on every answer, and the Host and Origin allow-list before any route runs. */
export function guardRequests(app: FastifyInstance, policy: ReturnType<typeof hostPolicy>) {
  app.addHook('onRequest', async (request, reply) => {
    reply
      .header('x-content-type-options', 'nosniff')
      .header('referrer-policy', 'no-referrer')
      .header('x-frame-options', 'DENY');
    reply.header('content-security-policy', CONTENT_SECURITY_POLICY);
    if (!policy.host(request.headers.host)) throw new DomainError('HOST_FORBIDDEN', 403);
    if (!policy.origin(request.headers.origin)) throw new DomainError('ORIGIN_FORBIDDEN', 403);
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });
}

/** Who is calling: a bearer token, or the session cookie (with its CSRF token on a mutation). */
export function requestActor(control: Control) {
  return (request: AuthInput): Actor => {
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
  };
}

/** The heavy reads of the session panel are revalidated rather than resent: an unchanged answer is a 304 with no body. */
export function revalidateReads(app: FastifyInstance) {
  app.addHook('onSend', async (request, reply, payload) => {
    const path = request.url.split('?')[0] ?? '';
    if (
      request.method !== 'GET' ||
      reply.statusCode !== 200 ||
      typeof payload !== 'string' ||
      !REVALIDATED.test(path)
    )
      return payload;
    const etag = `W/"${createHash('sha1').update(payload).digest('base64url')}"`;
    reply.header('etag', etag).header('cache-control', 'private, no-cache');
    const given = String(request.headers['if-none-match'] ?? '');
    if (given.split(',').some((v) => v.trim() === etag)) {
      reply.code(304);
      return '';
    }
    return payload;
  });
}

/** API answers are JSON and compress about tenfold; a phone on Wi-Fi waits for the bytes, not for the CPU. */
export function compressJson(app: FastifyInstance) {
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
}

/** Every failure becomes `{ error: { code, safeMessage, correlationId, retryable } }`; nothing else about it is sent. */
export function answerErrors(app: FastifyInstance) {
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
}

/** The cache policy of a built web file: hashed assets never change, the characters are revalidated daily, the page always. */
function cacheControlOf(path: string): string | null {
  if (/[\\/]assets[\\/][^\\/]+-[\w-]{8}\.(js|css)$/.test(path))
    return 'public, max-age=31536000, immutable';
  if (/[\\/]animals[\\/]/.test(path)) return 'public, max-age=86400, stale-while-revalidate=604800';
  return path.endsWith('index.html') ? 'no-cache' : null;
}

/** Serves the built web app; any other path than the API and its assets falls back to the page. */
export function serveWebApp(app: FastifyInstance) {
  const root = fileURLToPath(new URL('../../web/dist/', import.meta.url));
  if (!existsSync(root)) throw new Error('WEB_BUILD_REQUIRED');
  app.register(staticFiles, {
    root,
    wildcard: true,
    preCompressed: true, // the build leaves a .br and a .gz beside each text and model file
    setHeaders: (response, served) => {
      const cache = cacheControlOf(served.replace(/\.(br|gz)$/, '')); // the pre-compressed copy is served under its own name
      if (cache) response.header('cache-control', cache);
    },
  });
  app.setNotFoundHandler((request, reply) =>
    request.url.startsWith('/api/') || request.url.startsWith('/assets/')
      ? reply.code(404).send({ error: { code: 'NOT_FOUND', correlationId: request.id } })
      : reply.sendFile('index.html'),
  );
}
