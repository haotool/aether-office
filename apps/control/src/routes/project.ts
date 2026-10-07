import type { FastifyReply, FastifyRequest } from 'fastify';
import { DomainError, authorize } from '@aether/kernel';
import { z } from 'zod';
import type { RouteContext } from './context.js';

function startEventStream(reply: FastifyReply) {
  reply.hijack();
  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream',
    'cache-control': 'no-store',
    connection: 'keep-alive',
    'x-accel-buffering': 'no',
  });
}

/** Server-sent events of a project: what happened after `after`, a heartbeat when nothing did, a fault if access is lost. */
function streamEvents(
  { control, actor, streams }: RouteContext,
  request: FastifyRequest<{ Params: { projectId: string }; Querystring: { after?: string } }>,
  reply: FastifyReply,
) {
  const who = actor(request);
  let cursor = request.query.after ?? '0';
  control.events(who, request.params.projectId, cursor, 1);
  startEventStream(reply);
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
          !reply.raw.write(`id: ${event.seq}\nevent: domain\ndata: ${JSON.stringify(event)}\n\n`)
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
}

/** A project's own state: its policy, command intake, snapshot, event log and live stream, inbox, knowledge, approvals. */
export function projectRoutes(context: RouteContext) {
  projectStateRoutes(context);
  projectRecordRoutes(context);
}

function projectStateRoutes(context: RouteContext) {
  const { app, control, actor } = context;
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
      streamEvents(context, request, reply);
    },
  );
}

/** A project's messages, knowledge and approvals. */
function projectRecordRoutes({ app, control, actor }: RouteContext) {
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
}
