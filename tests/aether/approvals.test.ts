import { afterEach, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture, command } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';
import { enroll, claim, report } from '../../apps/control/src/services/runners.js';
import { revoke } from '../../apps/control/src/services/identity.js';
const cleanups: (() => unknown | Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanups.splice(0).reverse()) await close();
});
it('binds HTTP approvals to lease/session/action, fails closed on expiry/revocation and separates sent from acknowledged', async () => {
  let now = 1700000000000;
  const f = fixture(':memory:', () => now);
  cleanups.push(() => f.control.close());
  const app = createServer(f.control, { origin: 'http://localhost' });
  cleanups.push(() => app.close());
  const runner = enroll(f.control.ctx, f.owner.actor, 'approval runner', [f.projectId]);
  const other = enroll(f.control.ctx, f.owner.actor, 'other runner', [f.projectId]);
  const work = f.control.execute(
    f.owner.actor,
    command(
      'work.create',
      { title: 'Approval contract', description: '', acceptance: 'bound decisions' },
      f.projectId,
    ),
  );
  f.control.execute(
    f.owner.actor,
    command('work.assign', { workId: work.result['id'], agentId: f.senderId }, f.projectId, 1),
  );
  const run = claim(f.control.ctx, runner.actor, ['demo'])!;
  report(f.control.ctx, runner.actor, {
    type: 'started',
    sourceEventId: randomUUID(),
    runId: run.runId,
    epoch: run.epoch,
    providerSessionId: 'native-test-session',
    processIdentity: 'synthetic-owned-process',
  });
  const post = (url: string, payload: unknown, token = runner.token) =>
    app.inject({
      method: 'POST',
      url,
      headers: {
        host: 'localhost',
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: JSON.stringify(payload),
    });
  const data = {
    runId: run.runId,
    epoch: run.epoch,
    requestId: 'p1',
    kind: 'command',
    toolId: 'tool1',
    turnId: 'turn1',
    providerSessionId: 'native-test-session',
    parameters: { command: 'git status', token: 'never-display' },
  };
  const request = await post('/api/runner/approvals/request', data);
  expect(request.statusCode).toBe(200);
  const approval = request.json();
  expect((await post('/api/runner/approvals/request', data)).json()).toEqual(approval);
  expect(
    (
      await post('/api/runner/approvals/request', {
        ...data,
        parameters: { command: 'rm something' },
      })
    ).statusCode,
  ).toBe(409);
  expect((await post('/api/runner/approvals/request', { ...data, epoch: 2 })).statusCode).toBe(403);
  expect(
    (await post('/api/runner/approvals/request', { ...data, providerSessionId: 'wrong' }))
      .statusCode,
  ).toBe(409);
  const poll = { runId: run.runId, approvalId: approval.id };
  expect((await post('/api/runner/approvals/poll', poll, other.token)).statusCode).toBe(403);
  const decide = (id: string, actionHash: string, expectedVersion = 1) =>
    post(
      '/api/commands',
      command(
        'approval.decide',
        { approvalId: id, actionHash, decision: 'approve' },
        f.projectId,
        expectedVersion,
      ),
      f.owner.token,
    );
  expect((await decide(approval.id, '0'.repeat(64))).statusCode).toBe(409);
  expect((await decide(approval.id, approval.actionHash)).statusCode).toBe(200);
  expect((await decide(approval.id, approval.actionHash)).statusCode).toBe(409);
  expect((await post('/api/runner/approvals/poll', poll)).json().decision).toBe('approve');
  expect(
    (await post('/api/runner/approvals/sent', { runId: run.runId, requestId: 'p1' })).json(),
  ).toEqual({ recorded: true });
  const listed = await app.inject({
    url: `/api/projects/${f.projectId}/approvals`,
    headers: { host: 'localhost', authorization: `Bearer ${f.owner.token}` },
  });
  expect(listed.json()[0]).toMatchObject({
    state: 'decision_sent',
    providerAcknowledgedAt: null,
    version: 3,
  });
  expect(listed.body).not.toContain('never-display');
  const expired = (
    await post('/api/runner/approvals/request', { ...data, requestId: 'p2' })
  ).json();
  now += 120001;
  expect((await decide(expired.id, expired.actionHash)).statusCode).toBe(409);
  expect(
    (await post('/api/runner/approvals/poll', { runId: run.runId, approvalId: expired.id })).json(),
  ).toMatchObject({ decision: 'deny', state: 'expired' });
  const revoked = (
    await post('/api/runner/approvals/request', { ...data, requestId: 'p3' })
  ).json();
  expect((await decide(revoked.id, revoked.actionHash)).statusCode).toBe(200);
  revoke(f.control.ctx, f.owner.actor, f.owner.actor.id);
  expect(
    (await post('/api/runner/approvals/poll', { runId: run.runId, approvalId: revoked.id })).json(),
  ).toMatchObject({ decision: 'deny', state: 'expired' });
  f.control.ctx.sqlite
    .prepare('UPDATE machines SET revokedAt=? WHERE id=?')
    .run(now, runner.machineId);
  expect((await post('/api/runner/approvals/poll', poll)).statusCode).toBe(401);
});
