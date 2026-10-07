import { createHash } from 'node:crypto';
import type { Command } from '@aether/contracts';
import type { Context } from './context.js';
import type { ExternalIssue } from './connectors.js';
import type { Row, SyncResult } from './integrations.js';
import { createWork } from './work.js';

const hashOf = (issue: Pick<ExternalIssue, 'title' | 'body'>) =>
  createHash('sha256').update(`${issue.title}\0${issue.body}`).digest('hex');

const workTitle = (issue: ExternalIssue) => `${issue.reference} ${issue.title}`.slice(0, 160);
const workDescription = (issue: ExternalIssue) =>
  `${issue.body}\n\nSource: ${issue.url}`.slice(0, 16000);

type Link = { workId: string; contentHash: string; conflict: number };

/** An issue seen for the first time becomes a work item, linked to it. */
function importNewIssue(ctx: Context, row: Row, issue: ExternalIssue, hash: string) {
  const key = `integration:${row.id}:${issue.externalId}`;
  const created = createWork(ctx, {
    schemaVersion: 1,
    type: 'work.create',
    projectId: row.projectId,
    idempotencyKey: key,
    correlationId: key,
    data: {
      title: workTitle(issue),
      description: workDescription(issue),
      acceptance: `Resolve ${issue.reference} (${issue.url}). A human must confirm the acceptance criteria before assignment.`,
      dependencies: [],
      priority: 1,
    },
  } as Extract<Command, { type: 'work.create' }>);
  ctx.sqlite
    .prepare(
      'INSERT INTO external_links(connectionId,externalId,projectId,workId,url,contentHash,externalUpdatedAt) VALUES (?,?,?,?,?,?,?)',
    )
    .run(row.id, issue.externalId, row.projectId, created.id, issue.url, hash, issue.updatedAt);
}

/** An upstream edit: applied while its work has not started, otherwise recorded as a conflict for a human. */
function applyUpstreamEdit(
  ctx: Context,
  row: Row,
  issue: ExternalIssue,
  link: Link,
  hash: string,
  now: number,
): 'updated' | 'conflicts' {
  const work = ctx.sqlite
    .prepare('SELECT attempt,state FROM work_items WHERE id=?')
    .get(link.workId) as { attempt: number; state: string };
  if (work.attempt === 0 && ['backlog', 'ready'].includes(work.state)) {
    ctx.sqlite
      .prepare(
        'UPDATE work_items SET title=?,description=?,version=version+1,updatedAt=? WHERE id=?',
      )
      .run(workTitle(issue), workDescription(issue), now, link.workId);
    ctx.sqlite
      .prepare(
        'UPDATE external_links SET contentHash=?,externalUpdatedAt=?,conflict=0,pendingHash=NULL WHERE connectionId=? AND externalId=?',
      )
      .run(hash, issue.updatedAt, row.id, issue.externalId);
    return 'updated';
  }
  ctx.sqlite
    .prepare(
      'UPDATE external_links SET conflict=1,pendingHash=?,externalUpdatedAt=? WHERE connectionId=? AND externalId=?',
    )
    .run(hash, issue.updatedAt, row.id, issue.externalId);
  return 'conflicts';
}

/** Takes one fetched issue into the platform and says what happened to it (nothing, when it is unchanged). */
export function importIssue(
  ctx: Context,
  row: Row,
  issue: ExternalIssue,
  now: number,
): keyof SyncResult | null {
  const hash = hashOf(issue);
  const link = ctx.sqlite
    .prepare(
      'SELECT workId,contentHash,conflict FROM external_links WHERE connectionId=? AND externalId=?',
    )
    .get(row.id, issue.externalId) as Link | undefined;
  if (!link) {
    importNewIssue(ctx, row, issue, hash);
    return 'imported';
  }
  if (link.contentHash !== hash) return applyUpstreamEdit(ctx, row, issue, link, hash, now);
  ctx.sqlite
    .prepare('UPDATE external_links SET externalUpdatedAt=? WHERE connectionId=? AND externalId=?')
    .run(issue.updatedAt, row.id, issue.externalId);
  return null;
}
