import { diagnoseWork } from '../services/diagnostics.js';
import { postResult } from '../services/integrations.js';
import { listIntegrations } from '../services/jobs.js';
import { listReviewComments } from '../services/review-comments.js';
import { DomainError, authorize } from '@aether/kernel';
import type { RouteContext } from './context.js';

/** What belongs to one piece of work: review comments, integrations and post-back, diagnostics, reviews, workspaces. */
export function workRoutes(context: RouteContext) {
  workCommentRoutes(context);
  workInspectionRoutes(context);
}

function workCommentRoutes({ app, control, actor, options }: RouteContext) {
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
}

/** Diagnostics, review history and the workspaces of a work item. */
function workInspectionRoutes({ app, control, actor }: RouteContext) {
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
}
