import { randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import type { FastifyRequest } from 'fastify';
import type { Control } from '../control.js';
import { z } from 'zod';
import { DomainError, type Actor } from '@aether/kernel';
import { permissionDecisionSchema } from '@aether/contracts';
import { attributeSessions, scanLocalSessions } from '../services/runtime/local-sessions.js';
import { emit } from '../services/domain/context.js';
import {
  DEFAULT_WAIT_MS,
  MAX_RULES,
  MAX_RULE_CHARS,
  NONCE_PATTERN,
} from '@aether/providers/approval-config';
import { MAX_ATTEMPTS, pruneAttempts } from '../services/runtime/attempts.js';
import {
  approvalChannel,
  disableRemoteApprovals,
  enableRemoteApprovals,
  isHookToken,
  proofFor,
  remoteApprovals,
} from '../services/remote/remote-approvals.js';
import { requireOperator, type RouteContext } from './context.js';

const SESSION_ID = /^[A-Za-z0-9._-]{1,200}$/;
const MAX_LONG_POLL_MS = 25_000;
const HOOK_FAILURES = 10;
const LOOPBACK_ADDRESS = /^(127(\.\d{1,3}){3}|::1|::ffff:127(\.\d{1,3}){3})$/i;
const nonceSchema = z.string().regex(NONCE_PATTERN);

const createSchema = z.strictObject({
  sessionId: z.string().regex(SESSION_ID),
  cwd: z.string().min(1).max(4096),
  tool: z.string().min(1).max(80),
  input: z.unknown(),
  rules: z.array(z.string().max(MAX_RULE_CHARS)).max(MAX_RULES).default([]),
  waitMs: z.number().int().default(DEFAULT_WAIT_MS),
  nonce: nonceSchema,
});

/**
 * The hook's caller: on this machine, with the right token, Remote approvals on. The token is compared first, so only a
 * wrong one is counted (per address, like a login) and can be locked out: guessers can never lock the real hook out.
 */
function assertHook(control: Control, attempts: RouteContext['attempts'], request: FastifyRequest) {
  // A proxy on this machine makes every remote caller look like loopback; the hook itself never goes through one.
  const proxied = request.headers['x-forwarded-for'] || request.headers['forwarded'];
  if (proxied || !LOOPBACK_ADDRESS.test(request.socket.remoteAddress ?? ''))
    throw new DomainError('HOOK_LOOPBACK_ONLY', 403);
  const header = request.headers['authorization'];
  const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : '';
  if (isHookToken(control.ctx, token)) return;
  const now = control.ctx.now();
  const key = `hook:${request.ip}`;
  const failed = attempts.get(key);
  const live = failed !== undefined && failed.until > now;
  if (live && failed.count >= HOOK_FAILURES) throw new DomainError('HOOK_RATE_LIMIT', 429);
  if (attempts.size >= MAX_ATTEMPTS) pruneAttempts(attempts, now);
  attempts.set(key, {
    count: live ? failed.count + 1 : 1,
    until: live ? failed.until : now + 300000,
  });
  throw new DomainError('AUTH_REQUIRED', 401);
}

async function projectOf(control: Control, key: string): Promise<string> {
  const projects = control.ctx.sqlite.prepare('SELECT id,root FROM projects').all() as {
    id: string;
    root: string | null;
  }[];
  const sessions = await scanLocalSessions(
    process.env['AETHER_LOCAL_SESSIONS_HOME'] ?? homedir(),
    Date.now(),
    0,
  );
  const found = attributeSessions(sessions, projects).find((s) => s.key === key);
  if (!found?.projectId) throw new DomainError('SESSION_HAS_NO_PROJECT', 404);
  return found.projectId;
}

function hookRoutes({ app, control, attempts }: RouteContext) {
  const requests = control.permissionRequests;
  app.post('/api/hook/permission-requests', async (request) => {
    assertHook(control, attempts, request);
    const body = createSchema.parse(request.body);
    const sessionKey = `claude:${body.sessionId}`;
    requests.checkRate(sessionKey); // before the scan: a flood is refused without doing the expensive part
    const created = requests.create({
      sessionKey,
      projectId: await projectOf(control, sessionKey),
      tool: body.tool,
      input: body.input,
      rules: body.rules,
      waitMs: body.waitMs,
    });
    return { id: created.id, expiresAt: created.expiresAt };
  });
  const signed = (
    id: string,
    nonce: string,
    outcome: ReturnType<typeof requests.outcome>,
  ): typeof outcome & { proof?: string | undefined } =>
    outcome.decision ? { ...outcome, proof: proofFor(id, nonce, outcome.decision) } : outcome;
  app.get<{ Params: { id: string }; Querystring: { wait?: string; nonce?: string } }>(
    '/api/hook/permission-requests/:id',
    async (request) => {
      assertHook(control, attempts, request);
      const nonce = nonceSchema.parse(request.query.nonce);
      const wait = Math.min(Math.max(Number(request.query.wait) || 0, 0), MAX_LONG_POLL_MS);
      if (wait) await requests.waitFor(request.params.id, wait);
      return signed(request.params.id, nonce, requests.outcome(request.params.id));
    },
  );
  app.post<{ Params: { id: string } }>(
    '/api/hook/permission-requests/:id/fallback',
    async (request) => {
      assertHook(control, attempts, request);
      const { nonce } = z.strictObject({ nonce: nonceSchema }).parse(request.body);
      return signed(request.params.id, nonce, requests.fallback(request.params.id));
    },
  );
}

/**
 * A person at a browser: the cookie session (with its CSRF token on a mutation) and nothing else. A bearer token,
 * such as the owner token an agent running as this user could read from disk, never counts as one.
 */
function humanOf(actor: RouteContext['actor'], request: FastifyRequest): Actor {
  if (request.headers['authorization']) throw new DomainError('COOKIE_SESSION_REQUIRED', 403);
  const who = actor(request);
  requireOperator(who);
  return who;
}

function humanRoutes({ app, control, actor, origin }: RouteContext) {
  const requests = control.permissionRequests;
  app.get('/api/permission-requests', async (request) => {
    humanOf(actor, request);
    return { requests: requests.list(), ...remoteApprovals(control.ctx) };
  });
  // A human's answer. Idempotent by nature: the same answer twice is the same answer; a different one after the first
  // is refused (409), as is any answer once the hook has stopped waiting.
  app.post<{ Params: { id: string } }>('/api/permission-requests/:id/decision', async (request) => {
    const who = humanOf(actor, request);
    // Plain HTTP across a network would carry the session cookie in the clear: off unless the owner opts in.
    if (approvalChannel(origin, request.headers.host) === 'blocked')
      throw new DomainError('REMOTE_APPROVALS_LAN_DISABLED', 403);
    const body = permissionDecisionSchema.parse(request.body);
    const first = requests.get(request.params.id).state === 'pending';
    const result = requests.decide(request.params.id, body);
    if (!first) return result;
    const audit = randomUUID();
    emit(
      control.ctx,
      who,
      requests.projectOf(request.params.id),
      'permission-request.decided',
      {
        id: result.id,
        sessionKey: result.sessionKey,
        tool: result.tool,
        decision: body.decision,
        state: result.state,
      },
      audit,
      audit,
    );
    return result;
  });
}

function switchRoutes({ app, control, actor, origin }: RouteContext) {
  app.get('/api/remote-approvals', async (request) => {
    requireOperator(actor(request));
    return {
      ...remoteApprovals(control.ctx),
      channel: approvalChannel(origin, request.headers.host),
    };
  });
  // Owner only: switching it on issues the hook's token and writes the file the hook reads it from.
  app.put('/api/remote-approvals', async (request) => {
    const who = actor(request);
    if (who.role !== 'owner' || who.agentId || who.machineId)
      throw new DomainError('FORBIDDEN', 403);
    const { enabled } = z.strictObject({ enabled: z.boolean() }).parse(request.body);
    const state = enabled
      ? enableRemoteApprovals(control.ctx, origin.origin)
      : disableRemoteApprovals(control.ctx);
    return { ...state, channel: approvalChannel(origin, request.headers.host) };
  });
}

/**
 * Remote approvals, two audiences with two credentials: the hook on this machine (loopback only, own bearer token, can
 * only create and read or close its own requests) and a human owner or operator session (alone may list and decide).
 */
export function permissionRoutes(context: RouteContext) {
  hookRoutes(context);
  humanRoutes(context);
  switchRoutes(context);
}
