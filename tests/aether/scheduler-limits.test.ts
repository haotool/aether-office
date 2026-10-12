import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { claim, enroll, report } from '../../apps/control/src/services/runtime/runners.js';
import { command, fixture } from './fixture.js';

const agent = (f: ReturnType<typeof fixture>, name: string, provider = 'demo') =>
  String(
    f.control.execute(
      f.owner.actor,
      command(
        'agent.register',
        { name, role: 'Engineer', provider, species: 'fox', color: '#aabbcc' },
        f.projectId,
      ),
    ).result['id'],
  );
const assign = (f: ReturnType<typeof fixture>, agentId: string, title: string) => {
  const workId = String(
    f.control.execute(
      f.owner.actor,
      command('work.create', { title, description: '', acceptance: 'x' }, f.projectId),
    ).result['id'],
  );
  f.control.execute(f.owner.actor, command('work.assign', { workId, agentId }, f.projectId, 1));
  return workId;
};
const finish = (
  f: ReturnType<typeof fixture>,
  machine: ReturnType<typeof enroll>,
  run: NonNullable<ReturnType<typeof claim>>,
) => {
  report(f.control.ctx, machine.actor, {
    type: 'started',
    sourceEventId: randomUUID(),
    runId: run.runId,
    epoch: run.epoch,
    providerSessionId: 's',
    processIdentity: 'p',
  });
  report(f.control.ctx, machine.actor, {
    type: 'result',
    sourceEventId: randomUUID(),
    runId: run.runId,
    epoch: run.epoch,
    outcome: 'submitted',
    summary: 'done',
  });
};

it('never gives a machine more concurrent runs than its limit, and frees the slot when a run ends', () => {
  const f = fixture();
  try {
    const machine = enroll(f.control.ctx, f.owner.actor, 'One slot', [f.projectId], 1);
    assign(f, f.senderId, 'first');
    assign(f, f.recipientId, 'second');
    const first = claim(f.control.ctx, machine.actor, ['demo'])!;
    expect(first).toBeTruthy();
    expect(claim(f.control.ctx, machine.actor, ['demo'])).toBeNull();
    finish(f, machine, first);
    expect(claim(f.control.ctx, machine.actor, ['demo'])).toBeTruthy();
  } finally {
    f.control.close();
  }
});

it('caps live runs across all machines at four', () => {
  const f = fixture();
  try {
    const machines = Array.from({ length: 6 }, (_, i) =>
      enroll(f.control.ctx, f.owner.actor, `M${i}`, [f.projectId], 2),
    );
    for (let i = 0; i < 6; i++) assign(f, agent(f, `A${i}`), `work ${i}`);
    const claimed = machines.map((m) => claim(f.control.ctx, m.actor, ['demo'])).filter(Boolean);
    expect(claimed).toHaveLength(4);
  } finally {
    f.control.close();
  }
});

it('only offers work a runner can actually run: capability filter, and no two runs for the same agent', () => {
  const f = fixture();
  try {
    const machine = enroll(f.control.ctx, f.owner.actor, 'Demo only', [f.projectId], 4);
    // The demo-mode fixture cannot register a codex agent, so retarget one: only the capability filter matters here.
    const codex = agent(f, 'Codex-like');
    f.control.ctx.sqlite.prepare("UPDATE agents SET provider='codex' WHERE id=?").run(codex);
    assign(f, codex, 'needs codex');
    expect(claim(f.control.ctx, machine.actor, ['demo'])).toBeNull();

    assign(f, f.senderId, 'agent busy 1');
    assign(f, f.senderId, 'agent busy 2');
    expect(claim(f.control.ctx, machine.actor, ['demo'])).toBeTruthy();
    expect(claim(f.control.ctx, machine.actor, ['demo'])).toBeNull();
  } finally {
    f.control.close();
  }
});
