import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { integrationSchema, type Command, type IntegrationConnection } from '@aether/contracts';
import { assertVersion, DomainError, type Actor } from '@aether/kernel';
import { emit, type Context } from './context.js';
import {
  ConnectorError,
  RateLimited,
  githubComment,
  githubIssues,
  linearComment,
  linearIssues,
  type ExternalIssue,
  type GitHubConfig,
  type LinearConfig,
} from './connectors.js';
import { identityActor } from './identity.js';
import type { FetchPolicy } from './safe-fetch.js';
import { createWork } from './work.js';

const DEFAULT_BASE = {
  github: 'https://api.github.com',
  linear: 'https://api.linear.app',
} as const;
const MARKER = (workId: string) => `<!-- aether:work:${workId} -->`;

type Config = {
  provider: 'github' | 'linear';
  tokenEnv: string;
  webhookSecretEnv?: string;
  baseUrl: string;
  owner?: string;
  repo?: string;
  teamKey?: string;
};
type Row = {
  id: string;
  projectId: string;
  provider: 'github' | 'linear';
  config: string;
  enabled: number;
  cursor: string | null;
  backoffUntil: number | null;
  lastSyncAt: number | null;
  lastError: string | null;
  createdBy: string;
  version: number;
};

export type SyncOptions = { policy?: FetchPolicy; env?: Record<string, string | undefined> };
type SyncResult = { imported: number; updated: number; conflicts: number };

const hashOf = (issue: Pick<ExternalIssue, 'title' | 'body'>) =>
  createHash('sha256').update(`${issue.title}\0${issue.body}`).digest('hex');

function validBase(url: string): string {
  const parsed = new URL(url);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
  // Credentials must never travel over plain HTTP to a remote host.
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback))
    throw new DomainError('INTEGRATION_BASE_URL_INSECURE', 400);
  return parsed.origin;
}

const connection = (ctx: Context, projectId: string, id: string): Row => {
  const row = ctx.sqlite
    .prepare('SELECT * FROM integration_connections WHERE id=? AND projectId=?')
    .get(id, projectId) as Row | undefined;
  if (!row) throw new DomainError('INTEGRATION_NOT_FOUND', 404);
  return row;
};

const view = (ctx: Context, row: Row): IntegrationConnection => {
  const config = JSON.parse(row.config) as Config;
  const counts = ctx.sqlite
    .prepare(
      'SELECT COUNT(*) AS linked,COALESCE(SUM(conflict),0) AS conflicts FROM external_links WHERE connectionId=?',
    )
    .get(row.id) as { linked: number; conflicts: number };
  return integrationSchema.parse({
    id: row.id,
    provider: row.provider,
    target: row.provider === 'github' ? `${config.owner}/${config.repo}` : String(config.teamKey),
    tokenEnv: config.tokenEnv, // the variable NAME; the secret itself is never stored or returned
    enabled: row.enabled === 1,
    lastSyncAt: row.lastSyncAt,
    lastError: row.lastError,
    backoffUntil: row.backoffUntil,
    version: row.version,
    ...counts,
  });
};

export function listConnections(ctx: Context, projectId: string): IntegrationConnection[] {
  return (
    ctx.sqlite
      .prepare('SELECT * FROM integration_connections WHERE projectId=? ORDER BY createdAt,id')
      .all(projectId) as Row[]
  ).map((r) => view(ctx, r));
}

export function integrationCommand(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'integration.connect' | 'integration.toggle' }>,
) {
  if (c.type === 'integration.toggle') {
    const row = connection(ctx, c.projectId, c.data.integrationId);
    assertVersion(row.version, c.expectedVersion);
    ctx.sqlite
      .prepare('UPDATE integration_connections SET enabled=?,version=version+1 WHERE id=?')
      .run(c.data.enabled ? 1 : 0, row.id);
    return view(ctx, connection(ctx, c.projectId, row.id));
  }
  const d = c.data;
  const base = validBase(d.baseUrl ?? DEFAULT_BASE[d.provider]);
  const config: Config =
    d.provider === 'github'
      ? {
          provider: 'github',
          owner: d.owner,
          repo: d.repo,
          tokenEnv: d.tokenEnv,
          baseUrl: base,
          ...(d.webhookSecretEnv ? { webhookSecretEnv: d.webhookSecretEnv } : {}),
        }
      : { provider: 'linear', teamKey: d.teamKey, tokenEnv: d.tokenEnv, baseUrl: base };
  const id = randomUUID();
  ctx.sqlite
    .prepare(
      'INSERT INTO integration_connections(id,projectId,provider,config,createdBy,createdAt) VALUES (?,?,?,?,?,?)',
    )
    .run(id, c.projectId, d.provider, JSON.stringify(config), actor.id, ctx.now());
  return view(ctx, connection(ctx, c.projectId, id));
}

/**
 * Pull-based import. Field ownership: the external system owns title and description until work
 * starts; the platform owns state, assignment and results forever. After work starts, an upstream
 * edit is recorded as a conflict for a human and never overwrites anything. Because every import
 * compares a content hash, the platform's own write-backs (which bump updated_at) cannot loop.
 */
export async function syncConnection(
  ctx: Context,
  projectId: string,
  connectionId: string,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const row = connection(ctx, projectId, connectionId);
  const config = JSON.parse(row.config) as Config;
  const now = ctx.now();
  const fail = (code: string, retryAt: number | null = null): never => {
    ctx.sqlite
      .prepare(
        'UPDATE integration_connections SET lastError=?,backoffUntil=?,lastSyncAt=? WHERE id=?',
      )
      .run(code, retryAt, now, row.id);
    emit(
      ctx,
      identityActor(ctx, row.createdBy),
      projectId,
      'integration.sync.failed',
      { integrationId: row.id, code },
      row.id,
      row.id,
      'native',
    );
    throw new DomainError(code, code === 'INTEGRATION_RATE_LIMITED' ? 429 : 502);
  };
  if (!row.enabled) throw new DomainError('INTEGRATION_DISABLED', 409);
  if (row.backoffUntil && row.backoffUntil > now)
    throw new DomainError('INTEGRATION_RATE_LIMITED', 429);
  const token = (options.env ?? process.env)[config.tokenEnv];
  if (!token) return fail('INTEGRATION_TOKEN_MISSING');
  let issues: ExternalIssue[];
  try {
    const policy = options.policy ?? {};
    issues =
      row.provider === 'github'
        ? await githubIssues(config as unknown as GitHubConfig, token, row.cursor, policy, now)
        : await linearIssues(config as unknown as LinearConfig, token, row.cursor, policy, now);
  } catch (error) {
    if (error instanceof RateLimited) return fail('INTEGRATION_RATE_LIMITED', error.retryAt);
    if (error instanceof ConnectorError) return fail(`INTEGRATION_${error.code}`);
    if (error instanceof DomainError) return fail(error.code);
    return fail('INTEGRATION_UNREACHABLE');
  }
  return ctx.sqlite
    .transaction((): SyncResult => {
      const actor = identityActor(ctx, row.createdBy);
      const result: SyncResult = { imported: 0, updated: 0, conflicts: 0 };
      let cursor = row.cursor;
      for (const issue of issues) {
        if (!cursor || issue.updatedAt > cursor) cursor = issue.updatedAt;
        const hash = hashOf(issue);
        const link = ctx.sqlite
          .prepare(
            'SELECT workId,contentHash,conflict FROM external_links WHERE connectionId=? AND externalId=?',
          )
          .get(row.id, issue.externalId) as
          { workId: string; contentHash: string; conflict: number } | undefined;
        if (!link) {
          const key = `integration:${row.id}:${issue.externalId}`;
          const created = createWork(ctx, {
            schemaVersion: 1,
            type: 'work.create',
            projectId,
            idempotencyKey: key,
            correlationId: key,
            data: {
              title: `${issue.reference} ${issue.title}`.slice(0, 160),
              description: `${issue.body}\n\nSource: ${issue.url}`.slice(0, 16000),
              acceptance: `Resolve ${issue.reference} (${issue.url}). A human must confirm the acceptance criteria before assignment.`,
              dependencies: [],
              priority: 1,
            },
          } as Extract<Command, { type: 'work.create' }>);
          ctx.sqlite
            .prepare(
              'INSERT INTO external_links(connectionId,externalId,projectId,workId,url,contentHash,externalUpdatedAt) VALUES (?,?,?,?,?,?,?)',
            )
            .run(row.id, issue.externalId, projectId, created.id, issue.url, hash, issue.updatedAt);
          result.imported += 1;
          continue;
        }
        if (link.contentHash === hash) {
          ctx.sqlite
            .prepare(
              'UPDATE external_links SET externalUpdatedAt=? WHERE connectionId=? AND externalId=?',
            )
            .run(issue.updatedAt, row.id, issue.externalId);
          continue;
        }
        const work = ctx.sqlite
          .prepare('SELECT attempt,state FROM work_items WHERE id=?')
          .get(link.workId) as { attempt: number; state: string };
        if (work.attempt === 0 && ['backlog', 'ready'].includes(work.state)) {
          ctx.sqlite
            .prepare(
              'UPDATE work_items SET title=?,description=?,version=version+1,updatedAt=? WHERE id=?',
            )
            .run(
              `${issue.reference} ${issue.title}`.slice(0, 160),
              `${issue.body}\n\nSource: ${issue.url}`.slice(0, 16000),
              now,
              link.workId,
            );
          ctx.sqlite
            .prepare(
              'UPDATE external_links SET contentHash=?,externalUpdatedAt=?,conflict=0,pendingHash=NULL WHERE connectionId=? AND externalId=?',
            )
            .run(hash, issue.updatedAt, row.id, issue.externalId);
          result.updated += 1;
        } else {
          ctx.sqlite
            .prepare(
              'UPDATE external_links SET conflict=1,pendingHash=?,externalUpdatedAt=? WHERE connectionId=? AND externalId=?',
            )
            .run(hash, issue.updatedAt, row.id, issue.externalId);
          result.conflicts += 1;
        }
      }
      ctx.sqlite
        .prepare(
          'UPDATE integration_connections SET cursor=?,lastSyncAt=?,lastError=NULL,backoffUntil=NULL WHERE id=?',
        )
        .run(cursor, now, row.id);
      emit(
        ctx,
        actor,
        projectId,
        'integration.sync.completed',
        { integrationId: row.id, ...result },
        row.id,
        row.id,
        'native',
      );
      return result;
    })
    .immediate();
}

/** Posts the accepted result back to the linked issue. Only an explicit owner action reaches here. */
export async function postResult(
  ctx: Context,
  actor: Actor,
  projectId: string,
  workId: string,
  options: SyncOptions = {},
): Promise<{ posted: true }> {
  const work = ctx.sqlite
    .prepare('SELECT id,state,result FROM work_items WHERE id=? AND projectId=?')
    .get(workId, projectId) as { id: string; state: string; result: string | null } | undefined;
  if (!work) throw new DomainError('WORK_NOT_FOUND', 404);
  if (work.state !== 'completed') throw new DomainError('INTEGRATION_REQUIRES_ACCEPTED_WORK');
  const link = ctx.sqlite
    .prepare(
      'SELECT l.connectionId,l.externalId,l.url,c.provider,c.config FROM external_links l JOIN integration_connections c ON c.id=l.connectionId WHERE l.workId=?',
    )
    .get(workId) as
    | {
        connectionId: string;
        externalId: string;
        url: string;
        provider: 'github' | 'linear';
        config: string;
      }
    | undefined;
  if (!link) throw new DomainError('WORK_NOT_LINKED', 404);
  const config = JSON.parse(link.config) as Config;
  const token = (options.env ?? process.env)[config.tokenEnv];
  if (!token) throw new DomainError('INTEGRATION_TOKEN_MISSING', 502);
  const body = `${(work.result ?? 'Accepted.').slice(0, 6000)}\n\n${MARKER(work.id)}`;
  const now = ctx.now();
  const policy = options.policy ?? {};
  try {
    if (link.provider === 'github')
      await githubComment(
        config as unknown as GitHubConfig,
        token,
        `#${link.url.split('/').pop()}`,
        body,
        policy,
        now,
      );
    else
      await linearComment(
        config as unknown as LinearConfig,
        token,
        link.externalId,
        body,
        policy,
        now,
      );
  } catch (error) {
    if (error instanceof RateLimited) throw new DomainError('INTEGRATION_RATE_LIMITED', 429);
    throw new DomainError(
      error instanceof ConnectorError ? `INTEGRATION_${error.code}` : 'INTEGRATION_UNREACHABLE',
      502,
    );
  }
  emit(
    ctx,
    actor,
    projectId,
    'integration.result.posted',
    { workId, connectionId: link.connectionId },
    workId,
    workId,
    'native',
  );
  return { posted: true };
}

function verifyGithubSignature(secret: string, raw: Buffer, header: string | undefined): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = createHmac('sha256', secret).update(raw).digest();
  const given = Buffer.from(header.slice(7), 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The webhook is only a signal: authenticity is checked, the delivery is deduplicated, then state is pulled. */
export async function handleGithubWebhook(
  ctx: Context,
  connectionId: string,
  headers: Record<string, string | string[] | undefined>,
  raw: Buffer,
  options: SyncOptions = {},
): Promise<{ status: 'synced' | 'duplicate' | 'ignored' }> {
  const row = ctx.sqlite
    .prepare("SELECT * FROM integration_connections WHERE id=? AND provider='github'")
    .get(connectionId) as Row | undefined;
  // An unknown id answers like a bad signature, so the endpoint does not reveal which integrations exist.
  if (!row) throw new DomainError('WEBHOOK_SIGNATURE_INVALID', 401);
  const config = JSON.parse(row.config) as Config;
  const secret = config.webhookSecretEnv
    ? (options.env ?? process.env)[config.webhookSecretEnv]
    : undefined;
  const signature = headers['x-hub-signature-256'];
  if (
    !secret ||
    !verifyGithubSignature(secret, raw, Array.isArray(signature) ? signature[0] : signature)
  )
    throw new DomainError('WEBHOOK_SIGNATURE_INVALID', 401);
  const delivery = headers['x-github-delivery'];
  const deliveryId = Array.isArray(delivery) ? delivery[0] : delivery;
  if (!deliveryId || deliveryId.length > 100)
    throw new DomainError('WEBHOOK_DELIVERY_REQUIRED', 400);
  const claimed = ctx.sqlite
    .prepare(
      'INSERT OR IGNORE INTO webhook_deliveries(connectionId,deliveryId,receivedAt) VALUES (?,?,?)',
    )
    .run(connectionId, deliveryId, ctx.now());
  if (claimed.changes === 0) return { status: 'duplicate' };
  const event = headers['x-github-event'];
  if (event !== 'issues') return { status: 'ignored' };
  await syncConnection(ctx, row.projectId, connectionId, options);
  return { status: 'synced' };
}
