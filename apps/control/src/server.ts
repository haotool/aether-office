import { refreshMessageWaits } from './services/messages.js';
import Fastify, { LogController } from 'fastify';
import cookie from '@fastify/cookie';
import staticFiles from '@fastify/static';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { z } from 'zod';
import { CAPABILITIES, DomainError, authorize, type Actor } from '@aether/kernel';
import { login, sessionActor, hash, revoke } from './services/identity.js';
import { claim, enroll, heartbeat, report, sessionCredential } from './services/runners.js';
import { requestApproval, pollApproval, approvalSent } from './services/approvals.js';
import { terminalProfileSchema, verifierSchema } from '@aether/contracts';
import { claimJob, listIntegrations, reportJob } from './services/jobs.js';
import {
  claimTerminalCommand,
  reportTerminalCommand,
  reportTerminalSnapshot,
  listTerminals,
  readTerminal,
} from './services/terminals.js';
import { reportObservation, listObservations } from './services/observations.js';
import { listReviewComments } from './services/review-comments.js';
import {
  handleGithubWebhook,
  listConnections,
  postResult,
  syncConnection,
  type SyncOptions,
} from './services/integrations.js';
import { authenticateA2AClient } from './services/a2a-clients.js';
import { listMeetings } from './services/meetings.js';
import { listWorkflows } from './services/workflows.js';
import { listRooms } from './services/rooms.js';
import { redeemInvitation } from './services/invitations.js';
import { listSkills } from './services/skills.js';
import { listSchedules, tickSchedules } from './services/schedules.js';
import { listReservations } from './services/reservations.js';
import { readTranscript } from './services/session-transcript.js';
import { systemMetrics } from './services/system-metrics.js';
import { cleanMergedWorktrees, gitHealth, worktreeSizes } from './services/git-health.js';
import { listAgentProcesses } from './services/agent-processes.js';
import { emit } from './services/context.js';
import { gitGraph } from './services/git-graph.js';
import {
  attributeSessions,
  processOf,
  scanLocalSessions,
  sessionFile,
} from './services/local-sessions.js';
import { stopLocalSession } from './services/stop-session.js';
import { homedir } from 'node:os';
import { diagnoseWork } from './services/diagnostics.js';
import type { Control } from './control.js';

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

export function createServer(
  control: Control,
  options: {
    origin: string;
    serveWeb?: boolean;
    logger?: boolean;
    /** Test seam: where structured logs go (defaults to stdout). */
    logStream?: { write(line: string): void };
    /** Test seam: fetch policy and environment for connectors. Defaults are the secure ones. */
    connectors?: SyncOptions;
    /** Enable the A2A gateway. Defaults to the AETHER_A2A=on environment switch; off otherwise. */
    a2a?: boolean;
    /** Test seam: collects every route as it is registered, so tests can sweep them all. */
    routeLog?: { method: string; url: string }[];
  },
) {
  const origin = new URL(options.origin);
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
    if (request.headers.host !== origin.host) throw new DomainError('HOST_FORBIDDEN', 403);
    if (request.headers.origin && request.headers.origin !== origin.origin)
      throw new DomainError('ORIGIN_FORBIDDEN', 403);
    if (request.url.startsWith('/api/')) reply.header('cache-control', 'no-store');
  });
  function actor(request: {
    headers: Record<string, string | string[] | undefined>;
    cookies: Record<string, string | undefined>;
    method: string;
  }): Actor {
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
  app.get('/api/projects', async (request) => control.listProjects(actor(request)));
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/execution',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const policy = control.ctx.sqlite
        .prepare(
          'SELECT liveEnabled,maxTurns,timeoutMs,version FROM project_policies WHERE projectId=?',
        )
        .get(request.params.projectId) as
        { liveEnabled: number; maxTurns: number; timeoutMs: number; version: number } | undefined;
      return policy
        ? { ...policy, liveEnabled: !!policy.liveEnabled }
        : { liveEnabled: false, maxTurns: 3, timeoutMs: 120000, version: 0 };
    },
  );
  app.post('/api/commands', async (request) => control.execute(actor(request), request.body));
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/snapshot', async (request) =>
    control.snapshot(actor(request), request.params.projectId),
  );
  app.get<{ Params: { projectId: string }; Querystring: { after?: string } }>(
    '/api/projects/:projectId/events',
    async (request) => ({
      events: control.events(actor(request), request.params.projectId, request.query.after ?? '0'),
    }),
  );
  app.get<{ Params: { projectId: string }; Querystring: { after?: string } }>(
    '/api/projects/:projectId/stream',
    async (request, reply) => {
      const who = actor(request);
      let cursor = request.query.after ?? '0';
      control.events(who, request.params.projectId, cursor, 1);
      reply.hijack();
      reply.raw.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
        'x-accel-buffering': 'no',
      });
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        streams.delete(close);
        clearInterval(timer);
        reply.raw.end();
      };
      const tick = () => {
        if (closed) return;
        try {
          // Reauthenticate the exact browser/API credential, not just the original identity.
          const fresh = actor(request);
          const events = control.events(fresh, request.params.projectId, cursor);
          for (const event of events) {
            if (
              !reply.raw.write(
                `id: ${event.seq}\nevent: domain\ndata: ${JSON.stringify(event)}\n\n`,
              )
            ) {
              close();
              return;
            }
            cursor = event.seq;
          }
          if (!events.length && !reply.raw.write(': heartbeat\n\n')) close();
        } catch (error) {
          const code = error instanceof DomainError ? error.code : 'STREAM_ERROR';
          reply.raw.write(`event: fault\ndata: ${JSON.stringify({ code })}\n\n`);
          close();
        }
      };
      const timer = setInterval(tick, 1000);
      timer.unref();
      streams.add(close);
      request.raw.on('close', close);
      reply.raw.on('close', close);
      tick();
    },
  );
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/inbox', async (request) =>
    control.inbox(actor(request), request.params.projectId, request.query),
  );
  app.get<{ Params: { projectId: string; messageId: string } }>(
    '/api/projects/:projectId/messages/:messageId/waits',
    async (request) =>
      control.messageWaits(actor(request), request.params.projectId, request.params.messageId),
  );
  app.get<{ Params: { projectId: string; messageId: string } }>(
    '/api/projects/:projectId/messages/:messageId',
    async (request) =>
      control.message(actor(request), request.params.projectId, request.params.messageId),
  );
  app.get<{ Params: { projectId: string }; Querystring: { q?: string } }>(
    '/api/projects/:projectId/knowledge',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const q = z
        .string()
        .max(100)
        .parse(request.query.q ?? '');
      return control.ctx.sqlite
        .prepare(
          'SELECT k.id,k.title,k.body,k.source,k.classification,k.version,k.author,k.createdAt,k.updatedAt,k.reviewedBy,k.reviewReason,k.workId,k.artifactId,k.commitSha,COALESCE(aa.name,a.name,k.author) AS authorName,r.name AS reviewerName FROM knowledge k LEFT JOIN identities a ON a.id=k.author LEFT JOIN agents aa ON aa.id=a.agentId LEFT JOIN identities r ON r.id=k.reviewedBy WHERE k.projectId=? AND (instr(lower(k.title),lower(?))>0 OR instr(lower(k.body),lower(?))>0) ORDER BY k.createdAt DESC LIMIT 100',
        )
        .all(request.params.projectId, q, q);
    },
  );
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/approvals',
    async (request) => {
      const who = actor(request);
      authorize(who, 'approval.decide', request.params.projectId);
      return control.ctx.sqlite
        .prepare(
          'SELECT id,runId,sessionId,toolId,kind,state,version,providerRequestId,actionHash,parameters,expiresAt,decision,decisionSentAt,providerAcknowledgedAt FROM approval_decisions WHERE projectId=? ORDER BY expiresAt DESC LIMIT 100',
        )
        .all(request.params.projectId);
    },
  );
  app.post('/api/machines', async (request) => {
    const body = z
      .object({
        name: z.string().min(1).max(160),
        projectIds: z.array(z.string().uuid()).min(1).max(32),
        concurrency: z.number().int().min(1).max(4).default(2),
      })
      .strict()
      .parse(request.body);
    const enrolled = enroll(
      control.ctx,
      actor(request),
      body.name,
      body.projectIds,
      body.concurrency,
    );
    return { machineId: enrolled.machineId, token: enrolled.token };
  });
  app.post('/api/runner/heartbeat', async (request) => {
    const body = z
      .object({
        verifiers: z.array(verifierSchema).max(20).optional(),
        terminalProfiles: z.array(terminalProfileSchema).max(20).optional(),
      })
      .strict()
      .parse(request.body);
    return heartbeat(control.ctx, actor(request), body.verifiers, body.terminalProfiles);
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/terminals',
    async (request) => listTerminals(control.ctx, actor(request), request.params.projectId),
  );
  app.get<{ Params: { projectId: string; terminalId: string } }>(
    '/api/projects/:projectId/terminals/:terminalId',
    async (request) =>
      readTerminal(
        control.ctx,
        actor(request),
        request.params.projectId,
        request.params.terminalId,
      ),
  );
  // Read-only local session discovery (metadata + git state). Humans owner/operator only; AETHER_LOCAL_SESSIONS=off disables.
  app.get('/api/local-sessions', async (request) => {
    const who = actor(request);
    if (!['owner', 'operator'].includes(who.role) || who.agentId || who.machineId)
      throw new DomainError('FORBIDDEN', 403);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off') return { enabled: false, sessions: [] };
    return {
      enabled: true,
      sessions: attributeSessions(
        await scanLocalSessions(process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir()),
        control.listProjects(who),
      ),
    };
  });
  // Stops the process behind a session that is dormant or orphaned. Owner only, audited, SIGTERM to that process alone.
  app.post<{ Params: { key: string } }>('/api/local-sessions/:key/stop', async (request) => {
    const who = actor(request);
    if (who.role !== 'owner' || who.agentId || who.machineId)
      throw new DomainError('FORBIDDEN', 403);
    if (!/^(claude|codex):[A-Za-z0-9._-]{1,200}$/.test(request.params.key))
      throw new DomainError('INVALID_SESSION_KEY', 400);
    const body = z.object({ startedAt: z.number().int() }).strict().parse(request.body);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off')
      throw new DomainError('LOCAL_SESSIONS_OFF', 404);
    const sessions = attributeSessions(
      await scanLocalSessions(
        process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir(),
        Date.now(),
        0,
      ),
      control.listProjects(who),
    );
    const session = sessions.find((s) => s.key === request.params.key);
    if (!session?.projectId)
      throw new DomainError(session ? 'SESSION_HAS_NO_PROJECT' : 'SESSION_NOT_FOUND', 404);
    authorize(who, 'project.execution.configure', session.projectId); // owner-only action
    const result = await stopLocalSession({
      session,
      pid: processOf(session.key),
      startedAt: body.startedAt,
    });
    const audit = randomUUID();
    emit(
      control.ctx,
      who,
      session.projectId,
      'local-session.stop.requested',
      { key: session.key, state: session.liveness.state, outcome: result.outcome },
      audit,
      audit,
    );
    return result;
  });
  // Worktree and branch health of a project's repository: merged but still present, gone from disk, how large.
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-health',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const row = control.ctx.sqlite
        .prepare('SELECT root FROM projects WHERE id=?')
        .get(request.params.projectId) as { root: string | null } | undefined;
      if (!row?.root) throw new DomainError('PROJECT_HAS_NO_REPOSITORY', 404);
      return gitHealth(row.root);
    },
  );
  // What each of those worktrees takes on disk: separate and slower, so the report does not wait for it.
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-health/sizes',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const row = control.ctx.sqlite
        .prepare('SELECT root FROM projects WHERE id=?')
        .get(request.params.projectId) as { root: string | null } | undefined;
      if (!row?.root) throw new DomainError('PROJECT_HAS_NO_REPOSITORY', 404);
      return worktreeSizes(row.root);
    },
  );
  // Owner-only: remove the worktrees the health report lists as merged and clean, re-checked here, never forced.
  app.post<{ Params: { projectId: string }; Body: unknown }>(
    '/api/projects/:projectId/git-health/clean',
    async (request) => {
      const who = actor(request);
      authorize(who, 'project.execution.configure', request.params.projectId); // owner-only action
      const body = z
        .object({ paths: z.array(z.string().min(1).max(4096)).min(1).max(500) })
        .strict()
        .parse(request.body);
      const row = control.ctx.sqlite
        .prepare('SELECT root FROM projects WHERE id=?')
        .get(request.params.projectId) as { root: string | null } | undefined;
      if (!row?.root) throw new DomainError('PROJECT_HAS_NO_REPOSITORY', 404);
      const live = await listAgentProcesses().catch(() => null);
      if (!live) throw new DomainError('PROCESS_LIST_UNAVAILABLE', 503); // cannot prove no agent is inside: do nothing
      const audit = randomUUID();
      const results = await cleanMergedWorktrees(
        row.root,
        body.paths,
        live.processes.map((p) => p.cwd),
      );
      emit(
        control.ctx,
        who,
        request.params.projectId,
        'git.worktrees.cleaned',
        {
          removed: results.filter((r) => r.outcome === 'removed').map((r) => r.path),
          skipped: results.filter((r) => r.outcome === 'skipped').length,
        },
        audit,
        audit,
      );
      return { results };
    },
  );
  // Recent commit graph of a project's repository, laid out in lanes.
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-graph',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const row = control.ctx.sqlite
        .prepare('SELECT root FROM projects WHERE id=?')
        .get(request.params.projectId) as { root: string | null } | undefined;
      if (!row?.root) throw new DomainError('PROJECT_HAS_NO_REPOSITORY', 404);
      return gitGraph(row.root);
    },
  );
  // Machine load and free disk, for the people running agents on it.
  app.get('/api/system', async (request) => {
    const who = actor(request);
    if (!['owner', 'operator'].includes(who.role) || who.agentId || who.machineId)
      throw new DomainError('FORBIDDEN', 403);
    return systemMetrics([homedir(), process.env['AETHER_DATA_DIR'] ?? process.cwd()]);
  });
  // Live transcript of one local session, by the key the scanner found it under. Same audience as the list above.
  app.get<{ Params: { key: string } }>('/api/local-sessions/:key/transcript', async (request) => {
    const who = actor(request);
    if (!['owner', 'operator'].includes(who.role) || who.agentId || who.machineId)
      throw new DomainError('FORBIDDEN', 403);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off') throw new DomainError('NOT_FOUND', 404);
    const key = request.params.key;
    if (!/^(claude|codex):[A-Za-z0-9._-]{1,200}$/.test(key))
      throw new DomainError('INVALID_SESSION_KEY', 400);
    const found = sessionFile(key);
    if (!found) throw new DomainError('SESSION_NOT_FOUND', 404);
    return readTranscript(found.provider, found.file);
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/reservations',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      return { reservations: listReservations(control.ctx, request.params.projectId) };
    },
  );
  app.get<{ Params: { projectId: string; workId: string } }>(
    '/api/projects/:projectId/work/:workId/comments',
    async (request) =>
      listReviewComments(
        control.ctx,
        actor(request),
        request.params.projectId,
        request.params.workId,
      ),
  );
  app.get<{ Params: { projectId: string; workId: string } }>(
    '/api/projects/:projectId/work/:workId/integrations',
    async (request) =>
      listIntegrations(
        control.ctx,
        actor(request),
        request.params.projectId,
        request.params.workId,
      ),
  );
  // Static adapter matrix: lets the UI disable what a provider cannot do instead of guessing.
  app.get('/api/capabilities', async (request) => {
    authorize(actor(request), 'read');
    return { providers: CAPABILITIES };
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/schedules',
    async (request) => {
      authorize(actor(request), 'read', request.params.projectId);
      return { schedules: listSchedules(control.ctx, request.params.projectId) };
    },
  );
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/skills', async (request) => {
    const who = actor(request);
    authorize(who, 'read', request.params.projectId);
    return { skills: listSkills(control.ctx, who, request.params.projectId) };
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/integrations',
    async (request) => {
      authorize(actor(request), 'read', request.params.projectId);
      return { integrations: listConnections(control.ctx, request.params.projectId) };
    },
  );
  app.post<{ Params: { projectId: string; integrationId: string } }>(
    '/api/projects/:projectId/integrations/:integrationId/sync',
    async (request) => {
      authorize(actor(request), 'integration.connect', request.params.projectId);
      return syncConnection(
        control.ctx,
        request.params.projectId,
        request.params.integrationId,
        options.connectors,
      );
    },
  );
  app.post<{ Params: { projectId: string; workId: string } }>(
    '/api/projects/:projectId/work/:workId/post-result',
    async (request) => {
      const who = actor(request);
      authorize(who, 'integration.connect', request.params.projectId);
      return postResult(
        control.ctx,
        who,
        request.params.projectId,
        request.params.workId,
        options.connectors,
      );
    },
  );
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/rooms', async (request) => {
    const who = actor(request);
    authorize(who, 'read', request.params.projectId);
    // Agents see only the rooms they belong to.
    const rooms = listRooms(control.ctx, request.params.projectId);
    return {
      rooms: who.agentId ? rooms.filter((r) => r.members.includes(who.agentId!)) : rooms,
    };
  });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/workflows',
    async (request) => {
      authorize(actor(request), 'read', request.params.projectId);
      return { workflows: listWorkflows(control.ctx, request.params.projectId) };
    },
  );
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/meetings',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      // Agents learn of a meeting through the request they were sent, not from this list.
      if (who.agentId) return { meetings: [] };
      return { meetings: listMeetings(control.ctx, request.params.projectId) };
    },
  );
  const a2aEnabled = options.a2a ?? process.env['AETHER_A2A'] === 'on';
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId/a2a', async (request) => {
    authorize(actor(request), 'read', request.params.projectId);
    return {
      enabled: a2aEnabled,
      cardUrl: a2aEnabled ? `${options.origin}/.well-known/agent-card.json` : null,
      clients: control.ctx.sqlite
        .prepare(
          `SELECT c.id,c.name,c.maxOpen,c.revokedAt,
            (SELECT COUNT(*) FROM a2a_tasks t JOIN work_items w ON w.id=t.workId WHERE t.clientId=c.id AND w.state NOT IN ('completed','failed','cancelled')) AS open
           FROM a2a_clients c WHERE c.projectId=? ORDER BY c.createdAt`,
        )
        .all(request.params.projectId),
    };
  });
  // A2A gateway: absent (404) unless explicitly enabled. The SDK is only loaded when it is.
  if (a2aEnabled)
    app.register(async (scope) => {
      const { A2AGateway } = await import('./services/a2a.js');
      const { AgentCard } = await import('@a2a-js/sdk');
      const gateway = new A2AGateway(control, options.origin);
      scope.get('/.well-known/agent-card.json', async (_request, reply) =>
        reply.header('cache-control', 'public, max-age=60').send(AgentCard.toJSON(gateway.card)),
      );
      scope.post('/a2a', async (request, reply) => {
        const key = `a2a:${request.ip}`;
        const now = control.ctx.now();
        const last = attempts.get(key);
        if (last && last.until > now && last.count >= 20)
          throw new DomainError('A2A_RATE_LIMIT', 429);
        let client;
        try {
          client = authenticateA2AClient(control.ctx, request.headers.authorization);
        } catch (error) {
          attempts.set(key, {
            count: (last && last.until > now ? last.count : 0) + 1,
            until: now + 60_000,
          });
          throw error;
        }
        return reply.send(await gateway.handle(client, request.body));
      });
    });
  // GitHub signs the exact bytes it sends, so this scope keeps the body raw.
  app.register(async (scope) => {
    scope.addContentTypeParser('application/json', { parseAs: 'buffer' }, (_request, body, done) =>
      done(null, body),
    );
    scope.post<{ Params: { integrationId: string } }>(
      '/api/webhooks/github/:integrationId',
      async (request) =>
        handleGithubWebhook(
          control.ctx,
          request.params.integrationId,
          request.headers,
          request.body as Buffer,
          options.connectors,
        ),
    );
  });
  // Unauthenticated by design: the single-use invitation token is the credential. Rate limited by IP.
  app.post('/api/runner/enroll', async (request) => {
    const key = `enroll:${request.ip}`;
    const now = control.ctx.now();
    const last = attempts.get(key);
    if (last && last.until > now && last.count >= 10)
      throw new DomainError('ENROLL_RATE_LIMIT', 429);
    const { invitation } = z
      .object({ invitation: z.string().min(10).max(200) })
      .strict()
      .parse(request.body);
    try {
      return redeemInvitation(control.ctx, invitation);
    } catch (error) {
      attempts.set(key, {
        count: (last && last.until > now ? last.count : 0) + 1,
        until: now + 60_000,
      });
      throw error;
    }
  });
  app.post('/api/runner/observations', async (request) =>
    reportObservation(control.ctx, actor(request), request.body),
  );
  app.get<{ Params: { projectId: string }; Querystring: { before?: string } }>(
    '/api/projects/:projectId/observations',
    async (request) =>
      listObservations(
        control.ctx,
        actor(request),
        request.params.projectId,
        request.query.before === undefined ? undefined : Number(request.query.before),
      ),
  );
  app.post('/api/runner/terminals/claim', async (request) => ({
    command: claimTerminalCommand(control.ctx, actor(request)),
  }));
  app.post('/api/runner/terminals/result', async (request) =>
    reportTerminalCommand(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/terminals/snapshot', async (request) =>
    reportTerminalSnapshot(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/jobs/claim', async (request) => ({
    job: claimJob(control.ctx, actor(request)),
  }));
  app.post('/api/runner/jobs/report', async (request) =>
    reportJob(control.ctx, actor(request), request.body),
  );
  app.get<{ Params: { projectId: string; workId: string } }>(
    '/api/projects/:projectId/work/:workId/diagnostics',
    async (request) =>
      diagnoseWork(control.ctx, actor(request), request.params.projectId, request.params.workId),
  );
  app.get<{ Params: { projectId: string; workId: string } }>(
    '/api/projects/:projectId/work/:workId/reviews',
    async (request) => {
      authorize(actor(request), 'read', request.params.projectId);
      if (
        !control.ctx.sqlite
          .prepare('SELECT 1 FROM work_items WHERE id=? AND projectId=?')
          .get(request.params.workId, request.params.projectId)
      )
        throw new DomainError('WORK_NOT_FOUND', 404);
      return {
        runs: control.ctx.sqlite
          .prepare(
            "SELECT id,agentId,provider,state,reviewHead,reviewVersion,result,createdAt FROM runs WHERE workId=? AND purpose='review' ORDER BY createdAt DESC,rowid DESC LIMIT 20",
          )
          .all(request.params.workId),
        reviews: control.ctx.sqlite
          .prepare(
            'SELECT author AS reviewerId,decision,body,headSha,createdAt FROM reviews WHERE workId=? ORDER BY createdAt DESC,rowid DESC LIMIT 20',
          )
          .all(request.params.workId),
      };
    },
  );
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/workspaces',
    async (request) => {
      const who = actor(request);
      authorize(who, 'workspace.diff', request.params.projectId);
      return {
        workspaces: control.ctx.sqlite
          .prepare(
            'SELECT w.*,m.verifiers FROM workspaces w JOIN machines m ON m.id=w.machineId WHERE w.projectId=? ORDER BY w.createdAt DESC LIMIT 100',
          )
          .all(request.params.projectId),
        jobs: control.ctx.sqlite
          .prepare(
            'SELECT id,workId,workspaceId,kind,state,result,createdAt,expectedHead,expectedVersion FROM runner_jobs WHERE projectId=? ORDER BY createdAt DESC LIMIT 100',
          )
          .all(request.params.projectId),
      };
    },
  );
  app.post('/api/runner/claim', async (request) => {
    const body = z
      .object({
        providers: z
          .array(z.enum(['demo', 'claude', 'codex', 'acp']))
          .min(1)
          .max(4),
      })
      .strict()
      .parse(request.body);
    return { command: claim(control.ctx, actor(request), body.providers) };
  });
  app.post('/api/runner/session-credential', async (request) => {
    const data = z
      .object({ runId: z.string().uuid(), epoch: z.number().int().positive() })
      .strict()
      .parse(request.body);
    return sessionCredential(control.ctx, actor(request), data.runId, data.epoch);
  });
  app.post('/api/runner/report', async (request) =>
    report(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/approvals/request', async (request) =>
    requestApproval(control.ctx, actor(request), request.body),
  );
  app.post('/api/runner/approvals/poll', async (request) => {
    const body = z
      .object({ runId: z.string().uuid(), approvalId: z.string().uuid() })
      .strict()
      .parse(request.body);
    return pollApproval(control.ctx, actor(request), body.runId, body.approvalId);
  });
  app.post('/api/runner/approvals/sent', async (request) => {
    const body = z
      .object({ runId: z.string().uuid(), requestId: z.string().min(1).max(200) })
      .strict()
      .parse(request.body);
    return approvalSent(control.ctx, actor(request), body.runId, body.requestId);
  });
  app.post<{ Params: { identityId: string } }>(
    '/api/identities/:identityId/revoke',
    async (request) => {
      revoke(control.ctx, actor(request), request.params.identityId);
      return { ok: true };
    },
  );
  app.get('/api/metrics', async (request) => {
    const who = actor(request);
    authorize(who, 'identity.manage');
    return {
      activeRuns: control.ctx.sqlite
        .prepare("SELECT COUNT(*) AS count FROM runs WHERE state='running'")
        .get(),
      outbox: control.ctx.sqlite
        .prepare('SELECT state,COUNT(*) AS count FROM outbox GROUP BY state')
        .all(),
    };
  });
  if (options.serveWeb) {
    const root = fileURLToPath(new URL('../../web/dist/', import.meta.url));
    if (!existsSync(root)) throw new Error('WEB_BUILD_REQUIRED');
    app.register(staticFiles, { root, wildcard: true });
    app.setNotFoundHandler((request, reply) =>
      request.url.startsWith('/api/') || request.url.startsWith('/assets/')
        ? reply.code(404).send({ error: { code: 'NOT_FOUND', correlationId: request.id } })
        : reply.sendFile('index.html'),
    );
  }
  return app;
}
