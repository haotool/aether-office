import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
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
import { importIssue } from './integration-import.js';

const DEFAULT_BASE = {
  github: 'https://api.github.com',
  linear: 'https://api.linear.app',
} as const;
const MARKER = (workId: string) => `<!-- aether:work:${workId} -->`;

/** What is stored for a connection: the token's variable NAME, never the token. */
type Config =
  | (GitHubConfig & { provider: 'github'; tokenEnv: string; webhookSecretEnv?: string })
  | (LinearConfig & { provider: 'linear'; tokenEnv: string });
export type Row = {
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
export type SyncResult = { imported: number; updated: number; conflicts: number };

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
    target: config.provider === 'github' ? `${config.owner}/${config.repo}` : config.teamKey,
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

/** Records a failed sync on the connection and in the event log, then throws the matching error. */
function failSync(
  ctx: Context,
  row: Row,
  now: number,
  code: string,
  retryAt: number | null = null,
): never {
  ctx.sqlite
    .prepare(
      'UPDATE integration_connections SET lastError=?,backoffUntil=?,lastSyncAt=? WHERE id=?',
    )
    .run(code, retryAt, now, row.id);
  emit(
    ctx,
    identityActor(ctx, row.createdBy),
    row.projectId,
    'integration.sync.failed',
    { integrationId: row.id, code },
    row.id,
    row.id,
    'native',
  );
  throw new DomainError(code, code === 'INTEGRATION_RATE_LIMITED' ? 429 : 502);
}

async function fetchIssues(
  config: Config,
  token: string,
  cursor: string | null,
  options: SyncOptions,
  now: number,
): Promise<ExternalIssue[]> {
  const policy = options.policy ?? {};
  return config.provider === 'github'
    ? githubIssues(config, token, cursor, policy, now)
    : linearIssues(config, token, cursor, policy, now);
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
  if (!row.enabled) throw new DomainError('INTEGRATION_DISABLED', 409);
  if (row.backoffUntil && row.backoffUntil > now)
    throw new DomainError('INTEGRATION_RATE_LIMITED', 429);
  const token = (options.env ?? process.env)[config.tokenEnv];
  if (!token) return failSync(ctx, row, now, 'INTEGRATION_TOKEN_MISSING');
  let issues: ExternalIssue[];
  try {
    issues = await fetchIssues(config, token, row.cursor, options, now);
  } catch (error) {
    if (error instanceof RateLimited)
      return failSync(ctx, row, now, 'INTEGRATION_RATE_LIMITED', error.retryAt);
    if (error instanceof ConnectorError)
      return failSync(ctx, row, now, `INTEGRATION_${error.code}`);
    if (error instanceof DomainError) return failSync(ctx, row, now, error.code);
    return failSync(ctx, row, now, 'INTEGRATION_UNREACHABLE');
  }
  return ctx.sqlite.transaction(() => storeIssues(ctx, row, issues, now)).immediate();
}

/** Imports the fetched issues, advances the cursor and records that the sync completed. */
function storeIssues(ctx: Context, row: Row, issues: ExternalIssue[], now: number): SyncResult {
  const actor = identityActor(ctx, row.createdBy);
  const result: SyncResult = { imported: 0, updated: 0, conflicts: 0 };
  let cursor = row.cursor;
  for (const issue of issues) {
    if (!cursor || issue.updatedAt > cursor) cursor = issue.updatedAt;
    const outcome = importIssue(ctx, row, issue, now);
    if (outcome) result[outcome] += 1;
  }
  ctx.sqlite
    .prepare(
      'UPDATE integration_connections SET cursor=?,lastSyncAt=?,lastError=NULL,backoffUntil=NULL WHERE id=?',
    )
    .run(cursor, now, row.id);
  emit(
    ctx,
    actor,
    row.projectId,
    'integration.sync.completed',
    { integrationId: row.id, ...result },
    row.id,
    row.id,
    'native',
  );
  return result;
}

function postComment(
  config: Config,
  token: string,
  link: { externalId: string; url: string },
  body: string,
  policy: FetchPolicy,
  now: number,
) {
  return config.provider === 'github'
    ? githubComment(config, token, `#${link.url.split('/').pop()}`, body, policy, now)
    : linearComment(config, token, link.externalId, body, policy, now);
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
      'SELECT l.connectionId,l.externalId,l.url,c.config FROM external_links l JOIN integration_connections c ON c.id=l.connectionId WHERE l.workId=?',
    )
    .get(workId) as
    { connectionId: string; externalId: string; url: string; config: string } | undefined;
  if (!link) throw new DomainError('WORK_NOT_LINKED', 404);
  const config = JSON.parse(link.config) as Config;
  const token = (options.env ?? process.env)[config.tokenEnv];
  if (!token) throw new DomainError('INTEGRATION_TOKEN_MISSING', 502);
  const body = `${(work.result ?? 'Accepted.').slice(0, 6000)}\n\n${MARKER(work.id)}`;
  try {
    await postComment(config, token, link, body, options.policy ?? {}, ctx.now());
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
  const secretEnv = config.provider === 'github' ? config.webhookSecretEnv : undefined;
  const secret = secretEnv ? (options.env ?? process.env)[secretEnv] : undefined;
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
