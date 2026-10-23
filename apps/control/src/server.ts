import Fastify, { LogController, type FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import { hostPolicy } from './services/platform/host-policy.js';
import { createPairingStore } from './services/remote/pairing.js';
import type { Control } from './control.js';
import type { RouteContext, ServerOptions } from './routes/context.js';
import { adminRoutes } from './routes/admin.js';
import { authRoutes } from './routes/auth.js';
import { externalRoutes } from './routes/external.js';
import { composerRoutes } from './routes/composer.js';
import { localRoutes } from './routes/local.js';
import { usageRoutes } from './routes/usage.js';
import { permissionRoutes } from './routes/permissions.js';
import { projectListRoutes } from './routes/project-lists.js';
import { projectRoutes } from './routes/project.js';
import { runnerRoutes } from './routes/runner.js';
import { sessionStreamRoutes } from './routes/session-stream.js';
import { workRoutes } from './routes/work.js';
import {
  answerErrors,
  compressJson,
  guardRequests,
  requestActor,
  revalidateReads,
  runHousekeeping,
  serveWebApp,
} from './server-setup.js';

/** Routes that answer without a session or bearer token, and why. Everything else under /api requires one. */
export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([
  'GET /health',
  'POST /api/login',
  'POST /api/login/local',
  'POST /api/pairings/redeem', // the single-use pairing code is the credential
  'GET /api/session', // answers 401 itself
  'POST /api/session/csrf', // the session cookie is the credential: it exists for the page that holds no CSRF token
  'POST /api/runner/enroll', // the single-use invitation is the credential
  'POST /api/webhooks/github/:integrationId', // authenticated by HMAC signature
  'GET /.well-known/agent-card.json', // public by the A2A spec
  'POST /a2a', // its own bearer scheme
  'POST /api/hook/permission-requests', // the hook's bearer token
  'GET /api/hook/permission-requests/:id', // the hook's bearer token, for that one request
  'POST /api/hook/permission-requests/:id/fallback', // the hook's bearer token, for that one request
]);

function logRoutes(app: FastifyInstance, routeLog: { method: string; url: string }[]) {
  app.addHook('onRoute', (route) => {
    for (const method of [route.method].flat())
      if (method !== 'HEAD' && method !== 'OPTIONS') routeLog.push({ method, url: route.url });
  });
}

export function createServer(control: Control, options: ServerOptions) {
  const origin = new URL(options.origin);
  const app = Fastify({
    bodyLimit: 128 * 1024,
    trustProxy: options.trustProxy || false,
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
  const attempts = new Map<string, { count: number; until: number }>();
  const actor = requestActor(control);
  if (options.routeLog) logRoutes(app, options.routeLog);
  runHousekeeping(app, control, attempts, streams);
  app.register(cookie);
  guardRequests(app, hostPolicy(origin, options.lan ?? false), origin);
  // Authenticate before any handler parses or validates input, so a route can never forget to.
  app.addHook('preHandler', async (request) => {
    const url = request.routeOptions.url ?? '';
    if (url.startsWith('/api/') && !PUBLIC_ROUTES.has(`${request.method} ${url}`)) actor(request);
  });
  revalidateReads(app);
  compressJson(app);
  answerErrors(app);
  registerRoutes({
    app,
    control,
    options,
    origin,
    actor,
    attempts,
    pairings: createPairingStore(() => control.ctx.now()),
    streams,
  });
  if (options.serveWeb) serveWebApp(app);
  return app;
}

function registerRoutes(routes: RouteContext) {
  authRoutes(routes);
  projectRoutes(routes);
  projectListRoutes(routes);
  workRoutes(routes);
  runnerRoutes(routes);
  localRoutes(routes);
  usageRoutes(routes);
  permissionRoutes(routes);
  sessionStreamRoutes(routes);
  composerRoutes(routes);
  externalRoutes(routes);
  adminRoutes(routes);
}
