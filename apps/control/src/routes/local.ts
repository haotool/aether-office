import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { readClaudeLimits } from '../services/claude-limits.js';
import { listAgentProcesses } from '../services/agent-processes.js';
import { emit } from '../services/context.js';
import { gitGraph } from '../services/git-graph.js';
import { cleanMergedWorktrees, gitHealth, worktreeSizes } from '../services/git-health.js';
import {
  attributeSessions,
  processOf,
  scanLocalSessions,
  sessionFile,
} from '../services/local-sessions.js';
import { readTranscript } from '../services/session-transcript.js';
import { reapSessionZombies } from '../services/reap-zombies.js';
import { stopLocalSession } from '../services/stop-session.js';
import { systemMetrics } from '../services/system-metrics.js';
import { DomainError, authorize, type Actor } from '@aether/kernel';
import { z } from 'zod';
import { repositoryRoot, requireOperator, type RouteContext } from './context.js';

const SESSION_KEY = /^(claude|codex):[A-Za-z0-9._-]{1,200}$/;

/** This machine, read where it is: local sessions (list, stop, transcript), system load, Git health and graph. */
export function localRoutes({ app, control, actor }: RouteContext) {
  // Read-only local session discovery (metadata + git state). Humans owner/operator only; AETHER_LOCAL_SESSIONS=off disables.
  app.get('/api/local-sessions', async (request) => {
    const who = actor(request);
    requireOperator(who);
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
  // Resolves the session an owner is acting on, the same way for every action on one: owner only, a key of the
  // right shape, local discovery on, a session that belongs to a project the owner may configure.
  async function ownedSession(request: { params: { key: string }; body: unknown }, who: Actor) {
    if (who.role !== 'owner' || who.agentId || who.machineId)
      throw new DomainError('FORBIDDEN', 403);
    if (!SESSION_KEY.test(request.params.key)) throw new DomainError('INVALID_SESSION_KEY', 400);
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
    return { session, projectId: session.projectId, startedAt: body.startedAt };
  }
  const audited = (who: Actor, projectId: string, type: string, data: Record<string, unknown>) => {
    const audit = randomUUID();
    emit(control.ctx, who, projectId, type, data, audit, audit);
  };

  // Stops the process behind a session that is dormant or orphaned. Owner only, audited, SIGTERM to that process alone.
  app.post<{ Params: { key: string } }>('/api/local-sessions/:key/stop', async (request) => {
    const who = actor(request);
    const { session, projectId, startedAt } = await ownedSession(request, who);
    const result = await stopLocalSession({ session, pid: processOf(session.key), startedAt });
    audited(who, projectId, 'local-session.stop.requested', {
      key: session.key,
      state: session.liveness.state,
      outcome: result.outcome,
    });
    return result;
  });
  // Reminds the parents of a session's zombies to collect them (SIGCHLD): a zombie cannot be killed, only reaped.
  app.post<{ Params: { key: string } }>(
    '/api/local-sessions/:key/reap-zombies',
    async (request) => {
      const who = actor(request);
      const { session, projectId, startedAt } = await ownedSession(request, who);
      const result = await reapSessionZombies({ session, pid: processOf(session.key), startedAt });
      audited(who, projectId, 'local-session.zombies.nudged', { key: session.key, ...result });
      return result;
    },
  );
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
  // Recent commit graph of a project's repository, laid out in lanes.
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/git-graph',
    async (request) => {
      const who = actor(request);
      authorize(who, 'read', request.params.projectId);
      const root = repositoryRoot(control, request.params.projectId);
      return gitGraph(root);
    },
  );
  // Claude's 5-hour and 7-day subscription windows, when something on this machine has fetched them. Read-only.
  app.get('/api/claude-limits', async (request) => {
    requireOperator(actor(request));
    return { limits: await readClaudeLimits() };
  });
  // Machine load and free disk, for the people running agents on it.
  app.get('/api/system', async (request) => {
    const who = actor(request);
    requireOperator(who);
    return systemMetrics([homedir(), process.env['AETHER_DATA_DIR'] ?? process.cwd()]);
  });
  // Live transcript of one local session, by the key the scanner found it under. Same audience as the list above.
  app.get<{ Params: { key: string } }>('/api/local-sessions/:key/transcript', async (request) => {
    const who = actor(request);
    requireOperator(who);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off') throw new DomainError('NOT_FOUND', 404);
    const key = request.params.key;
    if (!SESSION_KEY.test(key)) throw new DomainError('INVALID_SESSION_KEY', 400);
    const found = sessionFile(key);
    if (!found) throw new DomainError('SESSION_NOT_FOUND', 404);
    return readTranscript(found.provider, found.file);
  });
}
