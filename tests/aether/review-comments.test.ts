import { createHash, randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { command, fixture, seedWork } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';

const sha = (c: string) => c.repeat(40);
const hash = (path: string, body: string) =>
  createHash('sha256').update(`${path}\0${body}`).digest('hex');
const diffText = (body: string[]) =>
  [
    'diff --git a/src/a.ts b/src/a.ts',
    '--- a/src/a.ts',
    '+++ b/src/a.ts',
    '@@ -1,1 +1,2 @@',
    ...body,
  ].join('\n');

it('binds comments to commit and hunk, and marks them carried or stale when the head moves', async () => {
  const f = fixture();
  const sql = f.control.ctx.sqlite;
  const run = (who: typeof f.owner.actor, type: string, data: unknown) =>
    f.control.execute(who, command(type, data, f.projectId));
  try {
    const workId = String(
      run(f.owner.actor, 'work.create', { title: 'Reviewed', description: '', acceptance: 'x' })
        .result['id'],
    );
    // Seed a reviewing task and diff jobs directly: this test targets the comment domain rules.
    sql.pragma('foreign_keys = OFF');
    seedWork(
      f.control,
      workId,
      "state='reviewing',headSha=?,submittedBy=?,assignee=?",
      sha('a'),
      f.sender.actor.id,
      f.sender.actor.agentId,
    );
    const job = (head: string, text: string, at: number) =>
      sql
        .prepare(
          "INSERT INTO runner_jobs(id,projectId,workId,workspaceId,machineId,kind,state,payload,result,requestedBy,expectedHead,expectedVersion,createdAt) VALUES (?,?,?,?,?,'diff','succeeded','{}',?,?,?,1,?)",
        )
        .run(
          randomUUID(),
          f.projectId,
          workId,
          'w',
          'm',
          JSON.stringify({ diff: { text } }),
          f.owner.actor.id,
          head,
          at,
        );
    const kept = ' keep\n+added';
    job(sha('a'), diffText([' keep', '+added']), 1);
    const h = hash('src/a.ts', kept);

    const base = {
      workId,
      headSha: sha('a'),
      path: 'src/a.ts',
      hunkHash: h,
      body: 'Needs a null check',
      line: 2,
    };
    expect(() => run(f.owner.actor, 'work.comment', { ...base, headSha: sha('b') })).toThrow(
      'REVIEW_HEAD_MOVED',
    );
    expect(() => run(f.owner.actor, 'work.comment', { ...base, hunkHash: '0'.repeat(64) })).toThrow(
      'HUNK_NOT_FOUND',
    );
    expect(() => run(f.sender.actor, 'work.comment', base)).toThrow(); // assignee cannot review own work
    const made = run(f.owner.actor, 'work.comment', base).result as { status: string };
    expect(made.status).toBe('current');

    const list = async () => {
      const app = createServer(f.control, { origin: 'http://127.0.0.1:4490' });
      try {
        const res = await app.inject({
          method: 'GET',
          url: `/api/projects/${f.projectId}/work/${workId}/comments`,
          headers: { authorization: `Bearer ${f.owner.token}`, host: '127.0.0.1:4490' },
        });
        return res.json() as { comments: { status: string }[]; hunks: unknown[] };
      } finally {
        await app.close();
      }
    };
    expect((await list()).comments.map((c) => c.status)).toEqual(['current']);

    sql.prepare('UPDATE work_items SET headSha=? WHERE id=?').run(sha('b'), workId);
    expect((await list()).comments.map((c) => c.status)).toEqual(['unknown']); // no diff for the new head yet

    job(sha('b'), diffText([' keep', '+added']), 2); // hunk unchanged: comment carries over
    expect((await list()).comments.map((c) => c.status)).toEqual(['carried']);

    job(sha('b'), diffText([' keep', '+rewritten']), 3); // hunk changed: comment is stale
    const after = await list();
    expect(after.comments.map((c) => c.status)).toEqual(['stale']);
    expect(after.hunks).toHaveLength(1);
  } finally {
    f.control.close();
  }
});
