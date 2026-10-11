import { revoke } from '../services/domain/identity.js';
import { authorize } from '@aether/kernel';
import type { RouteContext } from './context.js';

export function adminRoutes({ app, control, actor }: RouteContext) {
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
}
