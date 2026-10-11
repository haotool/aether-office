import { expect, it } from 'vitest';
import {
  claimJob,
  listIntegrations,
  reportJob,
} from '../../apps/control/src/services/work/jobs.js';
import { enroll } from '../../apps/control/src/services/runtime/runners.js';
import { command, fixture, seedWork } from './fixture.js';

const sha = (c: string) => c.repeat(40);

function setup() {
  const f = fixture();
  const sql = f.control.ctx.sqlite;
  const run = (type: string, data: unknown, version?: number) =>
    f.control.execute(f.owner.actor, command(type, data, f.projectId, version));
  const workId = String(
    run('work.create', { title: 'Integrate me', description: '', acceptance: 'x' }).result['id'],
  );
  const machine = enroll(f.control.ctx, f.owner.actor, 'Integration machine', [f.projectId]);
  const machineId = String(machine.actor.machineId);
  sql.pragma('foreign_keys = OFF');
  sql
    .prepare(
      'INSERT INTO workspaces(id,projectId,workId,machineId,repository,path,branch,baseSha,headSha,state,createdAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    )
    .run('ws1', f.projectId, workId, machineId, '/r', '/r/w', 'b', sha('0'), sha('a'), 'ready', 1);
  const accept = (verified: string) =>
    seedWork(
      f.control,
      workId,
      "state='completed',headSha=?,verifiedSha=?,reviewBy=?",
      sha('a'),
      verified,
      f.owner.actor.id,
    );
  const version = () =>
    (sql.prepare('SELECT version FROM work_items WHERE id=?').get(workId) as { version: number })
      .version;
  return { f, run, workId, machine, accept, version };
}

it('requires accepted+verified work, serialises per project and records conflict outcomes', () => {
  const { f, run, workId, machine, accept, version } = setup();
  const request = () =>
    run('work.integrate', { workId, baseBranch: 'main', expectedBase: sha('9') }, version());
  try {
    expect(() => request()).toThrow('INTEGRATION_REQUIRES_ACCEPTED_WORK');
    accept(sha('b'));
    expect(() => request()).toThrow('INTEGRATION_REQUIRES_ACCEPTED_WORK');
    accept(sha('a'));
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command(
          'work.integrate',
          { workId, baseBranch: 'main', expectedBase: sha('9') },
          f.projectId,
          version(),
        ),
      ),
    ).toThrow('FORBIDDEN');

    const queued = request().result as { id: string; candidate: string };
    expect(queued.candidate).toMatch(/^aether\/integrate\/[0-9a-f]{8}-aaaaaaaa$/);
    expect(() => request()).toThrow('INTEGRATION_BUSY');

    const job = claimJob(f.control.ctx, machine.actor)!;
    expect(job.kind).toBe('integrate');
    expect(job.payload.integrate).toMatchObject({ baseBranch: 'main', expectedBase: sha('9') });
    expect(() =>
      reportJob(f.control.ctx, machine.actor, { jobId: job.id, status: 'succeeded' }),
    ).toThrow('INTEGRATION_REQUIRED');
    expect(() =>
      reportJob(f.control.ctx, machine.actor, {
        jobId: job.id,
        status: 'succeeded',
        integration: { status: 'conflict', baseSha: sha('9'), headSha: sha('c'), files: ['a.txt'] },
      }),
    ).toThrow('INTEGRATION_BINDING_MISMATCH');

    const report = {
      jobId: job.id,
      status: 'succeeded' as const,
      integration: {
        status: 'conflict' as const,
        baseSha: sha('9'),
        headSha: sha('a'),
        files: ['a.txt'],
      },
    };
    reportJob(f.control.ctx, machine.actor, report);
    expect(reportJob(f.control.ctx, machine.actor, report)).toEqual({ duplicate: true });
    const listed = listIntegrations(f.control.ctx, f.owner.actor, f.projectId, workId).integrations;
    expect(listed).toMatchObject([
      { state: 'succeeded', status: 'conflict', candidate: null, headSha: sha('a'), error: null },
    ]);
    expect(
      f.control.ctx.sqlite.prepare('SELECT state FROM work_items WHERE id=?').get(workId),
    ).toEqual({ state: 'completed' });

    const retry = request().result as { id: string };
    const second = claimJob(f.control.ctx, machine.actor)!;
    expect(second.id).toBe(retry.id);
    reportJob(f.control.ctx, machine.actor, {
      jobId: second.id,
      status: 'succeeded',
      integration: {
        status: 'merged',
        baseSha: sha('9'),
        headSha: sha('a'),
        mergeSha: sha('d'),
        candidate: queued.candidate,
      },
    });
    expect(() => request()).toThrow('ALREADY_INTEGRATED');
  } finally {
    f.control.close();
  }
});
