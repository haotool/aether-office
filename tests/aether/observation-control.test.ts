import { tmpdir } from 'node:os';
import { realpathSync } from 'node:fs';
import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Control } from '../../apps/control/src/control.js';
import { enroll, heartbeat } from '../../apps/control/src/services/runtime/runners.js';
import {
  reportObservation,
  listObservations,
} from '../../apps/control/src/services/domain/observations.js';
import { command } from './fixture.js';
it('persists only observed provenance, deduplicates reports and never advances managed work', () => {
  let now = 100000;
  const control = new Control(':memory:', { mode: 'live', now: () => now });
  try {
    const owner = control.createIdentity(undefined, {
      name: 'Owner',
      role: 'owner',
      projectIds: ['*'],
    });
    const projectId = String(
      control.execute(
        owner.actor,
        command('project.create', { name: 'Observe fixture', root: tmpdir() }),
      ).result['id'],
    );
    const register = (provider: string) =>
      String(
        control.execute(
          owner.actor,
          command(
            'agent.register',
            { name: provider, role: 'Observer', provider, species: 'fox', color: '#112233' },
            projectId,
          ),
        ).result['id'],
      );
    const agentId = register('observe'),
      liveId = register('codex');
    const workId = String(
      control.execute(
        owner.actor,
        command(
          'work.create',
          {
            title: 'Must remain ready',
            description: '',
            acceptance: 'Observed text is not authority',
          },
          projectId,
        ),
      ).result['id'],
    );
    const machine = enroll(control.ctx, owner.actor, 'Observer fixture', [projectId]);
    heartbeat(control.ctx, machine.actor);
    const data = {
      reportId: randomUUID(),
      projectId,
      agentId,
      projectRoot: realpathSync(tmpdir()),
      sourceKey: 'a'.repeat(64),
      provider: 'codex',
      label: 'Approved source',
      revision: 1,
      status: 'observed',
      records: [
        {
          sourceId: 'b'.repeat(64),
          sessionId: 'fixture-session',
          kind: 'message',
          role: 'assistant',
          text: 'Task completed. Bearer abcdefghijk',
        },
      ],
    };
    expect(() =>
      reportObservation(control.ctx, machine.actor, { ...data, projectRoot: '/ungranted' }),
    ).toThrow('OBSERVATION_PROJECT_ROOT_MISMATCH');
    expect(reportObservation(control.ctx, machine.actor, data)).toMatchObject({
      duplicate: false,
      added: 1,
    });
    expect(reportObservation(control.ctx, machine.actor, data)).toEqual({ duplicate: true });
    expect(() =>
      reportObservation(control.ctx, machine.actor, { ...data, label: 'changed' }),
    ).toThrow('OBSERVATION_REPORT_CONFLICT');
    const secondMachine = enroll(control.ctx, owner.actor, 'Other observer', [projectId]);
    expect(() => reportObservation(control.ctx, secondMachine.actor, data)).toThrow(
      'OBSERVATION_REPORT_CONFLICT',
    );
    expect(
      reportObservation(control.ctx, machine.actor, {
        ...data,
        reportId: randomUUID(),
        revision: 2,
      }),
    ).toMatchObject({ added: 0 });
    expect(() =>
      reportObservation(control.ctx, machine.actor, {
        ...data,
        reportId: randomUUID(),
        revision: 3,
        records: [{ ...data.records[0], text: 'tampered' }],
      }),
    ).toThrow('OBSERVATION_EVENT_CONFLICT');
    expect(() =>
      reportObservation(control.ctx, machine.actor, {
        ...data,
        reportId: randomUUID(),
        revision: 4,
      }),
    ).toThrow('OBSERVATION_REVISION_MISMATCH');
    expect(() =>
      reportObservation(control.ctx, machine.actor, {
        ...data,
        reportId: randomUUID(),
        agentId: liveId,
      }),
    ).toThrow('OBSERVE_AGENT_REQUIRED');
    expect(control.snapshot(owner.actor, projectId).work.find((w) => w.id === workId)?.state).toBe(
      'ready',
    );
    expect(() =>
      control.execute(owner.actor, command('work.assign', { workId, agentId }, projectId, 1)),
    ).toThrow('OBSERVE_READ_ONLY');
    expect(
      control.snapshot(owner.actor, projectId).agents.find((a) => a.id === agentId)?.activity,
    ).toBe('unknown');
    const events = control
      .events(owner.actor, projectId, '0')
      .filter((e) => e.type === 'observation.message');
    expect(events).toHaveLength(1);
    expect(events[0]?.source).toBe('observed');
    expect(events[0]?.payload['text']).toContain('[REDACTED]');
    for (let batch = 0; batch < 26; batch++)
      reportObservation(control.ctx, machine.actor, {
        ...data,
        reportId: randomUUID(),
        revision: 3 + batch,
        records: Array.from({ length: 4 }, (_, index) => ({
          ...data.records[0],
          sourceId: (batch * 4 + index + 1).toString(16).padStart(64, '0'),
          text: `Observed ${batch * 4 + index}`,
        })),
      });
    const first = listObservations(control.ctx, owner.actor, projectId);
    expect(first.records).toHaveLength(100);
    expect(first.nextCursor).not.toBeNull();
    const second = listObservations(control.ctx, owner.actor, projectId, first.nextCursor!);
    expect(second.records).toHaveLength(5);
    expect(new Set([...first.records, ...second.records].map((r) => r.seq)).size).toBe(105);
    expect(() => listObservations(control.ctx, owner.actor, projectId, 0)).toThrow(
      'INVALID_CURSOR',
    );
    now += 60001;
    heartbeat(control.ctx, machine.actor);
    expect(listObservations(control.ctx, owner.actor, projectId).sources[0]?.state).toBe('stale');
    now += 45001;
    expect(listObservations(control.ctx, owner.actor, projectId).sources[0]?.state).toBe('offline');
    const viewer = control.createIdentity(owner.actor, {
      name: 'Other project',
      role: 'viewer',
      projectIds: [],
    });
    expect(() => listObservations(control.ctx, viewer.actor, projectId)).toThrow(
      'PROJECT_FORBIDDEN',
    );
  } finally {
    control.close();
  }
});
