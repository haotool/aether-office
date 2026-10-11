import { createHash, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import type { Control } from '../control.js';
import { emit } from '../services/domain/context.js';
import {
  attributeSessions,
  processOf,
  scanLocalSessions,
  sessionFile,
} from '../services/runtime/local-sessions.js';
import { runningSpeech } from '../services/sessions/session-speech.js';
import { readTranscript } from '../services/sessions/session-transcript.js';
import { reapSessionZombies } from '../services/runtime/reap-zombies.js';
import { clockOutSessions } from '../services/runtime/clock-out.js';
import { stopLocalSession } from '../services/runtime/stop-session.js';
import { DomainError, authorize, type Actor } from '@aether/kernel';
import {
  clockOutRequestSchema,
  type ClockOutItem,
  type ClockOutRequest,
  type ClockOutResponse,
} from '@aether/contracts';
import { z } from 'zod';
import { requireOperator, type RouteContext } from './context.js';
import { gitRoutes, machineRoutes } from './local-git.js';

const SESSION_KEY = /^(claude|codex):[A-Za-z0-9._-]{1,200}$/;
/** Clock-outs already answered, by caller and Idempotency-Key: a retry gets the same answer and kills nothing twice. */
const REMEMBERED_CLOCK_OUTS = 50;

export function localRoutes(context: RouteContext) {
  localSessionReadRoutes(context);
  localSessionActionRoutes(context);
  clockOutRoute(context);
  gitRoutes(context);
  machineRoutes(context);
}

// Every session as it is right now (never the cache): what an action that ends processes must be decided on.
const freshSessions = async (control: Control, who: Actor) =>
  attributeSessions(
    await scanLocalSessions(process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir(), Date.now(), 0),
    control.listProjects(who),
  );

const assertOwner = (who: Actor) => {
  if (who.role !== 'owner' || who.agentId || who.machineId) throw new DomainError('FORBIDDEN', 403);
};

// Resolves the session an owner is acting on, the same way for every action on one: owner only, a key of the
// right shape, local discovery on, a session that belongs to a project the owner may configure.
async function ownedSession(
  control: Control,
  request: { params: { key: string }; body: unknown },
  who: Actor,
) {
  assertOwner(who);
  if (!SESSION_KEY.test(request.params.key)) throw new DomainError('INVALID_SESSION_KEY', 400);
  const body = z.strictObject({ startedAt: z.number().int() }).parse(request.body);
  if (process.env['AETHER_LOCAL_SESSIONS'] === 'off')
    throw new DomainError('LOCAL_SESSIONS_OFF', 404);
  const sessions = await freshSessions(control, who);
  const session = sessions.find((s) => s.key === request.params.key);
  if (!session?.projectId)
    throw new DomainError(session ? 'SESSION_HAS_NO_PROJECT' : 'SESSION_NOT_FOUND', 404);
  authorize(who, 'project.execution.configure', session.projectId);
  return { session, projectId: session.projectId, startedAt: body.startedAt };
}

const audited = (
  control: Control,
  who: Actor,
  projectId: string,
  type: string,
  data: Record<string, unknown>,
) => {
  const audit = randomUUID();
  emit(control.ctx, who, projectId, type, data, audit, audit);
};

function localSessionReadRoutes({ app, control, actor }: RouteContext) {
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
  // The last prompt and reply of every running session (redacted, cut short, never stored), for the speech bubbles.
  app.get('/api/local-sessions/speech', async (request) => {
    const who = actor(request);
    requireOperator(who);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off') return { speech: {} };
    const sessions = await scanLocalSessions(
      process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir(),
    );
    return { speech: await runningSpeech(sessions) };
  });
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

function localSessionActionRoutes({ app, control, actor }: RouteContext) {
  // Stops the process behind a session that is dormant or orphaned. Owner only, audited, SIGTERM to that process alone.
  app.post<{ Params: { key: string } }>('/api/local-sessions/:key/stop', async (request) => {
    const who = actor(request);
    const { session, projectId, startedAt } = await ownedSession(control, request, who);
    const result = await stopLocalSession({ session, pid: processOf(session.key), startedAt });
    audited(control, who, projectId, 'local-session.stop.requested', {
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
      const { session, projectId, startedAt } = await ownedSession(control, request, who);
      const result = await reapSessionZombies({ session, pid: processOf(session.key), startedAt });
      audited(control, who, projectId, 'local-session.zombies.nudged', {
        key: session.key,
        ...result,
      });
      return result;
    },
  );
}

async function runClockOut(
  control: Control,
  who: Actor,
  body: ClockOutRequest,
): Promise<ClockOutResponse> {
  const sessions = await freshSessions(control, who);
  const projectOf = new Map(sessions.map((s) => [s.key, s.projectId]));
  const results = await clockOutSessions({
    request: body,
    sessions,
    pidOf: processOf,
    mayStop: (projectId) => {
      try {
        authorize(who, 'project.execution.configure', projectId);
        return true;
      } catch {
        return false;
      }
    },
  });
  const byProject = new Map<string, ClockOutItem[]>();
  for (const r of results) {
    const projectId = projectOf.get(r.key);
    if (projectId) byProject.set(projectId, [...(byProject.get(projectId) ?? []), r]);
  }
  for (const [projectId, mine] of byProject)
    audited(control, who, projectId, 'local-session.clock-out.requested', {
      minIdleMs: body.minIdleMs,
      cleared: mine.filter((r) => r.outcome === 'cleared').map((r) => r.key),
      skipped: mine.filter((r) => r.outcome !== 'cleared').length,
    });
  return { results };
}

// "Clock out": ends the processes of the sessions named, each re-checked on the server (idle long enough, the same
// process, an owner's project) and each given its own result. Owner only, audited per project, idempotent by key.
function clockOutRoute({ app, control, actor }: RouteContext) {
  const clockOuts = new Map<string, { hash: string; response: Promise<ClockOutResponse> }>();
  app.post('/api/local-sessions/clock-out', async (request) => {
    const who = actor(request);
    assertOwner(who);
    const key = request.headers['idempotency-key'];
    if (typeof key !== 'string' || key.length < 8 || key.length > 100)
      throw new DomainError('IDEMPOTENCY_KEY_REQUIRED', 400);
    const body = clockOutRequestSchema.parse(request.body);
    if (process.env['AETHER_LOCAL_SESSIONS'] === 'off')
      throw new DomainError('LOCAL_SESSIONS_OFF', 404);
    const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
    const remembered = clockOuts.get(`${who.id}:${key}`);
    if (remembered) {
      if (remembered.hash !== hash) throw new DomainError('IDEMPOTENCY_CONFLICT');
      return remembered.response;
    }
    const response = runClockOut(control, who, body);
    clockOuts.set(`${who.id}:${key}`, { hash, response });
    const oldest = clockOuts.keys().next();
    if (clockOuts.size > REMEMBERED_CLOCK_OUTS && !oldest.done) clockOuts.delete(oldest.value);
    response.catch(() => clockOuts.delete(`${who.id}:${key}`));
    return response;
  });
}
