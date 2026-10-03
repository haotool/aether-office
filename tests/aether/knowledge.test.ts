import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture, command } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';
it('keeps proposals distinct from human approval with scoped references, version checks and provenance', async () => {
  let now = 100000;
  const f = fixture(':memory:', () => now);
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4488' });
  try {
    const workId = String(
      f.control.execute(
        f.owner.actor,
        command(
          'work.create',
          { title: 'Linked work', description: '', acceptance: 'Reference only' },
          f.projectId,
        ),
      ).result['id'],
    );
    const other = String(
      f.control.execute(f.owner.actor, command('project.create', { name: 'Other project' })).result[
        'id'
      ],
    );
    const foreignWork = String(
      f.control.execute(
        f.owner.actor,
        command('work.create', { title: 'Foreign', description: '', acceptance: 'Private' }, other),
      ).result['id'],
    );
    const proposal = {
      title: '可追溯知識教訓',
      body: 'A proposal is not test evidence.',
      source: 'fixture://source',
      workId,
      commitSha: 'a'.repeat(40),
    };
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('knowledge.propose', { ...proposal, workId: foreignWork }, f.projectId),
      ),
    ).toThrow('KNOWLEDGE_WORK_NOT_FOUND');
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('knowledge.propose', { ...proposal, artifactId: randomUUID() }, f.projectId),
      ),
    ).toThrow('KNOWLEDGE_ARTIFACT_NOT_FOUND');
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('knowledge.propose', { ...proposal, classification: 'verified' }, f.projectId),
      ),
    ).toThrow();
    expect(() =>
      f.control.execute(
        f.sender.actor,
        command('knowledge.propose', { ...proposal, source: ' ' }, f.projectId),
      ),
    ).toThrow();
    const created = f.control.execute(
      f.sender.actor,
      command('knowledge.propose', proposal, f.projectId),
    );
    expect(created.result).toMatchObject({
      classification: 'proposed',
      author: f.sender.actor.id,
      workId,
      reviewedBy: null,
      createdAt: now,
      updatedAt: now,
    });
    const knowledgeId = String(created.result['id']);
    const approve = command(
      'knowledge.approve',
      {
        knowledgeId,
        decision: 'approve',
        reason: 'Human checked the cited source, without claiming tests passed.',
      },
      f.projectId,
      1,
    );
    expect(() => f.control.execute(f.sender.actor, approve)).toThrow('FORBIDDEN');
    expect(() => f.control.execute(f.owner.actor, { ...approve, expectedVersion: 0 })).toThrow(
      'VERSION_CONFLICT',
    );
    now += 1000;
    const approved = f.control.execute(f.owner.actor, approve);
    expect(f.control.execute(f.owner.actor, approve)).toEqual(approved);
    expect(approved.result).toMatchObject({
      classification: 'human_approved',
      version: 2,
      reviewedBy: f.owner.actor.id,
      updatedAt: now,
    });
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command(
          'knowledge.approve',
          { knowledgeId, decision: 'reject', reason: 'Cannot silently overwrite review' },
          f.projectId,
          2,
        ),
      ),
    ).toThrow('KNOWLEDGE_ALREADY_REVIEWED');
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command(
          'knowledge.approve',
          { knowledgeId, decision: 'approve', reason: 'Cross project' },
          other,
          2,
        ),
      ),
    ).toThrow('KNOWLEDGE_NOT_FOUND');
    const response = await app.inject({
      method: 'GET',
      url: `/api/projects/${f.projectId}/knowledge?q=${encodeURIComponent('教訓')}`,
      headers: { host: '127.0.0.1:4488', authorization: `Bearer ${f.owner.token}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()[0]).toMatchObject({
      authorName: 'Sender',
      reviewerName: 'Test owner',
      workId,
      classification: 'human_approved',
    });
    const rejectedId = String(
      f.control.execute(
        f.sender.actor,
        command('knowledge.propose', { ...proposal, title: 'Rejected lesson' }, f.projectId),
      ).result['id'],
    );
    expect(
      f.control.execute(
        f.owner.actor,
        command(
          'knowledge.approve',
          { knowledgeId: rejectedId, decision: 'reject', reason: 'Source is insufficient' },
          f.projectId,
          1,
        ),
      ).result['classification'],
    ).toBe('rejected');
    expect(
      f.control
        .events(f.owner.actor, f.projectId, '0')
        .filter((e) => e.type === 'knowledge.approve'),
    ).toHaveLength(2);
  } finally {
    await app.close();
    f.control.close();
  }
});
