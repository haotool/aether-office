import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { detectModels } from '@aether/providers/models';
import { DomainError, authorize } from '@aether/kernel';
import { z } from 'zod';
import { readClaudeLimits } from '../services/platform/claude-limits.js';
import { listAgentProcesses } from '../services/runtime/agent-processes.js';
import { emit } from '../services/domain/context.js';
import { gitGraph } from '../services/git/git-graph.js';
import { cleanMergedWorktrees, gitHealth, worktreeSizes } from '../services/git/git-health.js';
import { systemMetrics } from '../services/platform/system-metrics.js';
import { repositoryRoot, requireOperator, type RouteContext } from './context.js';

export function gitRoutes({ app, control, actor }: RouteContext) {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-health',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const root = repositoryRoot(control, request.params.projectId);
      return gitHealth(root);
    },
  );
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-health/sizes',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const root = repositoryRoot(control, request.params.projectId);
      return worktreeSizes(root);
    },
  );
  gitCleanRoute({ app, control, actor });
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-graph',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const hasRepository = control.ctx.sqlite
        .prepare('SELECT 1 FROM projects WHERE id=? AND root IS NOT NULL')
        .get(request.params.projectId);
      if (!hasRepository) return { commits: [], lanes: 0 };
      return gitGraph(repositoryRoot(control, request.params.projectId));
    },
  );
}

function gitCleanRoute({ app, control, actor }: Pick<RouteContext, 'app' | 'control' | 'actor'>) {
  app.post<{ Params: { projectId: string }; Body: unknown }>(
    '/api/projects/:projectId/git-health/clean',
    async (request) => {
      const who = actor(request);
      authorize(who, 'project.execution.configure', request.params.projectId);
      const body = z
        .strictObject({ paths: z.array(z.string().min(1).max(4096)).min(1).max(500) })
        .parse(request.body);
      const root = repositoryRoot(control, request.params.projectId);
      const live = await listAgentProcesses().catch(() => null);
      if (!live) throw new DomainError('PROCESS_LIST_UNAVAILABLE', 503); // cannot prove no agent is inside: do nothing
      const audit = randomUUID();
      const results = await cleanMergedWorktrees(
        root,
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
}

export function machineRoutes({ app, actor }: RouteContext) {
  app.get('/api/claude-limits', async (request) => {
    requireOperator(actor(request));
    return { limits: await readClaudeLimits() };
  });
  app.get<{ Querystring: { refresh?: string } }>('/api/models', async (request) => {
    actor(request);
    return {
      catalogs: await detectModels(process.env, { refresh: request.query.refresh === '1' }),
    };
  });
  app.get('/api/system', async (request) => {
    const who = actor(request);
    requireOperator(who);
    return systemMetrics([homedir(), process.env['AETHER_DATA_DIR'] ?? process.cwd()]);
  });
}
