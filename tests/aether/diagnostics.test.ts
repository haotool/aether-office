import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture, command } from './fixture.js';
import { diagnoseWork } from '../../apps/control/src/services/platform/diagnostics.js';
import {
  enroll,
  claim,
  heartbeat,
  report,
} from '../../apps/control/src/services/runtime/runners.js';
import {
  requestApproval,
  decideApproval,
} from '../../apps/control/src/services/permissions/approvals.js';
it('diagnoses event silence independently of heartbeat, explicit waits and ownership without side effects', () => {
  let now = 100000;
  const f = fixture(':memory:', () => now);
  try {
    const workId = String(
      f.control.execute(
        f.owner.actor,
        command(
          'work.create',
          { title: 'Diagnosis', description: '', acceptance: 'read-only' },
          f.projectId,
        ),
      ).result['id'],
    );
    const diagnose = () => diagnoseWork(f.control.ctx, f.owner.actor, f.projectId, workId);
    expect(diagnose().reason).toBe('no_run');
    f.control.execute(
      f.owner.actor,
      command('work.assign', { workId, agentId: f.senderId }, f.projectId, 1),
    );
    expect(diagnose().reason).toBe('queued');
    const machine = enroll(f.control.ctx, f.owner.actor, 'diagnostic runner', [f.projectId]);
    heartbeat(f.control.ctx, machine.actor);
    const run = claim(f.control.ctx, machine.actor, ['demo'])!;
    const send = (event: Record<string, unknown>) =>
      report(f.control.ctx, machine.actor, {
        ...event,
        sourceEventId: randomUUID(),
        runId: run.runId,
        epoch: run.epoch,
      });
    send({ type: 'started', providerSessionId: 'diagnosis-fixture', processIdentity: 'synthetic' });
    expect(diagnose().reason).toBe('recent_events');
    now += 60001;
    heartbeat(f.control.ctx, machine.actor);
    expect(diagnose()).toMatchObject({
      reason: 'no_recent_events',
      machineOnline: true,
      lastEventAt: 100000,
      heartbeatAt: now,
    });
    send({ type: 'activity', activity: 'waiting_peer', summary: 'Explicit peer wait' });
    expect(diagnose().reason).toBe('awaiting_peer');
    send({
      type: 'provider',
      event: {
        kind: 'assistant.message',
        messageId: 'new-message',
        turnId: 'new-turn',
        text: 'Peer wait finished',
      },
    });
    expect(diagnose().reason).toBe('recent_events');
    const approval = requestApproval(f.control.ctx, machine.actor, {
      runId: run.runId,
      epoch: run.epoch,
      requestId: 'diagnostic-permission',
      kind: 'command',
      toolId: 'tool',
      turnId: 'turn',
      providerSessionId: 'diagnosis-fixture',
      parameters: {},
    });
    expect(diagnose().reason).toBe('awaiting_permission');
    decideApproval(f.control.ctx, f.owner.actor, f.projectId, 1, {
      approvalId: approval.id,
      actionHash: approval.actionHash,
      decision: 'approve',
    });
    expect(diagnose().reason).toBe('awaiting_provider_ack');
    now += 120001;
    heartbeat(f.control.ctx, machine.actor);
    expect(diagnose().reason).toBe('approval_expired');
    now += 45001;
    const seq = f.control.highWatermark(f.projectId);
    expect(diagnose().reason).toBe('machine_offline');
    expect(f.control.highWatermark(f.projectId)).toBe(seq);
    expect(
      f.control.ctx.sqlite.prepare('SELECT state FROM runs WHERE id=?').get(run.runId),
    ).toEqual({ state: 'running' });
    const outsider = f.control.createIdentity(f.owner.actor, {
      name: 'Other scope',
      role: 'viewer',
      projectIds: [],
    });
    expect(() => diagnoseWork(f.control.ctx, outsider.actor, f.projectId, workId)).toThrow(
      'PROJECT_FORBIDDEN',
    );
  } finally {
    f.control.close();
  }
});
