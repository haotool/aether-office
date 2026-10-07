import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { detectModels } from '@aether/providers/models';
import { DomainError, authorize } from '@aether/kernel';
import { z } from 'zod';
import { readClaudeLimits } from '../services/claude-limits.js';
import { listAgentProcesses } from '../services/agent-processes.js';
import { emit } from '../services/context.js';
import { gitGraph } from '../services/git-graph.js';
import { cleanMergedWorktrees, gitHealth, worktreeSizes } from '../services/git-health.js';
import { systemMetrics } from '../services/system-metrics.js';
import { repositoryRoot, requireOperator, type RouteContext } from './context.js';

/** A project's repository: worktree and branch health, cleaning, the commit graph. */
export function gitRoutes({ app, control, actor }: RouteContext) {
  // Worktree and branch health of a project's repository: merged but still present, gone from disk, how large.
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-health',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const root = repositoryRoot(control, request.params.projectId);
      return gitHealth(root);
    },
  );
  // What each of those worktrees takes on disk: separate and slower, so the report does not wait for it.
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
  // Recent commit graph of a project's repository, laid out in lanes.
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-graph',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const hasRepository = control.ctx.sqlite
        .prepare('SELECT 1 FROM projects WHERE id=? AND root IS NOT NULL')
        .get(request.params.projectId);
      if (!hasRepository) return { commits: [], lanes: 0 }; // nothing to draw is not an error
      return gitGraph(repositoryRoot(control, request.params.projectId));
    },
  );
}

function gitCleanRoute({ app, control, actor }: Pick<RouteContext, 'app' | 'control' | 'actor'>) {
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

/** This machine: Claude's subscription windows, the models its CLIs offer, load and free disk. */
export function machineRoutes({ app, actor }: RouteContext) {
  // Claude's 5-hour and 7-day subscription windows, when something on this machine has fetched them. Read-only.
  app.get('/api/claude-limits', async (request) => {
    requireOperator(actor(request));
    return { limits: await readClaudeLimits() };
  });
  // The models the Claude and Codex CLIs on this machine offer, read from their caches (never written, no secrets). Any
  // signed-in role may read it; ?refresh=1 skips the short in-memory memory.
  app.get<{ Querystring: { refresh?: string } }>('/api/models', async (request) => {
    actor(request);
    return {
      catalogs: await detectModels(process.env, { refresh: request.query.refresh === '1' }),
    };
  });
  // Machine load and free disk, for the people running agents on it.
  app.get('/api/system', async (request) => {
    const who = actor(request);
    requireOperator(who);
    return systemMetrics([homedir(), process.env['AETHER_DATA_DIR'] ?? process.cwd()]);
  });
}
