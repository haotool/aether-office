import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { redeemInvitation } from '../../apps/control/src/services/remote/invitations.js';
import { claim, report } from '../../apps/control/src/services/runtime/runners.js';
import { command, fixture } from './fixture.js';

it('invitations expire, redeem once, and bind a machine to one project, providers and roots', () => {
  let now = 1_000_000;
  const f = fixture(':memory:', () => now);
  try {
    const invite = (data: Record<string, unknown> = {}) =>
      f.control.execute(
        f.owner.actor,
        command(
          'machine.invite',
          { name: 'Remote', providers: ['demo'], roots: ['/srv/work'], ttlSec: 60, ...data },
          f.projectId,
        ),
      ).result as { token: string };
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('machine.invite', { name: 'x', providers: ['demo'], roots: ['/r'] }, f.projectId),
      ),
    ).toThrow('FORBIDDEN');

    const expired = invite();
    now += 61_000;
    expect(() => redeemInvitation(f.control.ctx, expired.token)).toThrow('INVITATION_INVALID');

    const fresh = invite();
    const machine = redeemInvitation(f.control.ctx, fresh.token);
    expect(() => redeemInvitation(f.control.ctx, fresh.token)).toThrow('INVITATION_INVALID');
    const row = f.control.ctx.sqlite
      .prepare('SELECT projectIds,allowedProviders,allowedRoots FROM machines WHERE id=?')
      .get(machine.machineId);
    expect(row).toEqual({
      projectIds: JSON.stringify([f.projectId]),
      allowedProviders: '["demo"]',
      allowedRoots: '["/srv/work"]',
    });

    const actor = f.control.authenticate(machine.token);
    expect(actor).toMatchObject({
      role: 'runner',
      machineId: machine.machineId,
      projectIds: [f.projectId],
    });
    expect(() => claim(f.control.ctx, actor, ['codex'])).toThrow('PROVIDER_NOT_GRANTED');
    expect(claim(f.control.ctx, actor, ['demo', 'codex'])).toBeNull();

    const workId = String(
      f.control.execute(
        f.owner.actor,
        command('work.create', { title: 'W', description: '', acceptance: 'x' }, f.projectId),
      ).result['id'],
    );
    f.control.execute(
      f.owner.actor,
      command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
    );
    const run = claim(f.control.ctx, actor, ['demo'])!;
    const workspace = (path: string) => ({
      id: randomUUID(),
      projectId: f.projectId,
      workId,
      attempt: 1,
      repository: '/srv/work/repo',
      path,
      branch: 'b',
      baseSha: 'a'.repeat(40),
      createdAt: now,
    });
    const send = (path: string) =>
      report(f.control.ctx, actor, {
        type: 'workspace',
        sourceEventId: randomUUID(),
        runId: run.runId,
        epoch: run.epoch,
        workspace: workspace(path),
      });
    expect(() => send('/srv/work-evil/checkout')).toThrow('WORKSPACE_ROOT_NOT_GRANTED');
    expect(() => send('/etc/checkout')).toThrow('WORKSPACE_ROOT_NOT_GRANTED');
    expect(send('/srv/work/checkout')).toEqual({ duplicate: false });
  } finally {
    f.control.close();
  }
});
