import { createHash, randomUUID } from 'node:crypto';
import type { Command, ReviewComments } from '@aether/contracts';
import { commentStatus, DomainError, parseDiff, type Actor } from '@aether/kernel';
import { authorize } from '@aether/kernel';
import { task, type Context } from '../domain/context.js';

type Hashed = { path: string; header: string; hash: string };

const hunkHash = (path: string, body: string) =>
  createHash('sha256').update(`${path}\0${body}`).digest('hex');

function hunksAt(ctx: Context, workId: string, head: string): Hashed[] | null {
  const row = ctx.sqlite
    .prepare(
      "SELECT result FROM runner_jobs WHERE workId=? AND kind='diff' AND state='succeeded' AND expectedHead=? ORDER BY createdAt DESC LIMIT 1",
    )
    .get(workId, head) as { result: string } | undefined;
  if (!row) return null;
  const text = (JSON.parse(row.result) as { diff?: { text?: string } }).diff?.text ?? '';
  return parseDiff(text).map((h) => ({
    path: h.path,
    header: h.header,
    hash: hunkHash(h.path, h.body),
  }));
}

export function addReviewComment(
  ctx: Context,
  actor: Actor,
  c: Extract<Command, { type: 'work.comment' }>,
) {
  const work = task(ctx, c.projectId, c.data.workId);
  if (work.state !== 'reviewing') throw new DomainError('INVALID_TRANSITION');
  if (work.submittedBy === actor.id || (actor.agentId && actor.agentId === work.assignee))
    throw new DomainError('SELF_REVIEW_FORBIDDEN', 403);
  // A comment is bound to the exact commit it was written against; never to "whatever is latest".
  if (work.headSha !== c.data.headSha) throw new DomainError('REVIEW_HEAD_MOVED');
  const hunks = hunksAt(ctx, work.id, c.data.headSha);
  if (!hunks?.some((h) => h.path === c.data.path && h.hash === c.data.hunkHash))
    throw new DomainError('HUNK_NOT_FOUND', 404);
  const row = {
    id: randomUUID(),
    workId: work.id,
    authorId: actor.id,
    headSha: c.data.headSha,
    path: c.data.path,
    hunkHash: c.data.hunkHash,
    line: c.data.line ?? null,
    body: c.data.body,
    createdAt: ctx.now(),
  };
  ctx.sqlite
    .prepare(
      'INSERT INTO review_comments(id,projectId,workId,authorId,headSha,path,hunkHash,line,body,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?)',
    )
    .run(
      row.id,
      c.projectId,
      row.workId,
      row.authorId,
      row.headSha,
      row.path,
      row.hunkHash,
      row.line,
      row.body,
      row.createdAt,
    );
  return { ...row, status: 'current' as const };
}

export function listReviewComments(
  ctx: Context,
  actor: Actor,
  projectId: string,
  workId: string,
): ReviewComments {
  authorize(actor, 'read', projectId);
  const work = task(ctx, projectId, workId);
  const hunks = work.headSha ? hunksAt(ctx, work.id, work.headSha) : null;
  const rows = ctx.sqlite
    .prepare(
      'SELECT id,workId,authorId,headSha,path,hunkHash,line,body,createdAt FROM review_comments WHERE workId=? ORDER BY createdAt,id',
    )
    .all(work.id) as Omit<ReviewComments['comments'][number], 'status'>[];
  return {
    head: work.headSha ?? null,
    hunks: hunks ?? [],
    comments: rows.map((r) => ({
      ...r,
      status: commentStatus(r, work.headSha ?? null, hunks),
    })),
  };
}
