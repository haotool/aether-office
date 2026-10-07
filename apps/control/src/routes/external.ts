import { authenticateA2AClient } from '../services/a2a-clients.js';
import { handleGithubWebhook, syncConnection } from '../services/integrations.js';
import { MAX_ATTEMPTS, pruneAttempts } from '../services/attempts.js';
import { DomainError, authorize } from '@aether/kernel';
import type { RouteContext } from './context.js';

const WEBHOOK_PER_MINUTE = 120;

/** Connectors to the outside: integration sync, GitHub webhooks and the A2A gateway. */
export function externalRoutes({ app, control, actor, options, attempts }: RouteContext) {
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
      const { A2AGateway } = await import('../services/a2a.js');
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
    // Every call counts, valid or not: GitHub sends a few a minute, so this only bounds a flood from one address.
    scope.addHook('onRequest', async (request) => {
      const key = `webhook:${request.ip}`;
      const now = control.ctx.now();
      const last = attempts.get(key);
      const live = last !== undefined && last.until > now;
      if (live && last.count >= WEBHOOK_PER_MINUTE)
        throw new DomainError('WEBHOOK_RATE_LIMIT', 429);
      if (attempts.size >= MAX_ATTEMPTS) pruneAttempts(attempts, now);
      attempts.set(key, {
        count: live ? last.count + 1 : 1,
        until: live ? last.until : now + 60_000,
      });
    });
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
}
