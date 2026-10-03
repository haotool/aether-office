import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fixture, command } from './fixture.js';
import { taskPositions } from '../../apps/web/src/features/taskGraph.js';
it('edits only unassigned dependencies atomically and rejects cycles, foreign references and stale versions', () => {
  const f = fixture();
  try {
    const create = (title: string, dependencies: string[] = []) =>
      String(
        f.control.execute(
          f.owner.actor,
          command(
            'work.create',
            { title, description: '', acceptance: 'DAG safety', dependencies },
            f.projectId,
          ),
        ).result['id'],
      );
    const a = create('A'),
      b = create('B', [a]),
      c = create('C', [b]);
    const edit = (workId: string, dependencies: string[], version: number) =>
      command('work.dependencies', { workId, dependencies }, f.projectId, version);
    const before = f.control.highWatermark(f.projectId);
    expect(() => f.control.execute(f.owner.actor, edit(a, [c], 1))).toThrow('DAG_CYCLE');
    expect(() => f.control.execute(f.owner.actor, edit(b, [a, a], 1))).toThrow(
      'DUPLICATE_DEPENDENCY',
    );
    expect(() => f.control.execute(f.owner.actor, edit(b, [randomUUID()], 1))).toThrow(
      'DEPENDENCY_NOT_FOUND',
    );
    expect(f.control.highWatermark(f.projectId)).toBe(before);
    expect(f.control.snapshot(f.owner.actor, f.projectId).dependencies).toHaveLength(2);
    const other = String(
      f.control.execute(f.owner.actor, command('project.create', { name: 'Other DAG' })).result[
        'id'
      ],
    );
    const foreign = String(
      f.control.execute(
        f.owner.actor,
        command('work.create', { title: 'Other', description: '', acceptance: 'private' }, other),
      ).result['id'],
    );
    expect(() => f.control.execute(f.owner.actor, edit(b, [foreign], 1))).toThrow(
      'DEPENDENCY_NOT_FOUND',
    );
    const clear = edit(c, [], 1);
    const first = f.control.execute(f.owner.actor, clear);
    expect(first.result).toMatchObject({ state: 'ready', version: 2, dependencies: [] });
    expect(f.control.execute(f.owner.actor, clear)).toEqual(first);
    expect(() => f.control.execute(f.owner.actor, edit(c, [a], 1))).toThrow('VERSION_CONFLICT');
    expect(() => f.control.execute(f.sender.actor, edit(c, [a], 2))).toThrow('FORBIDDEN');
    f.control.execute(f.owner.actor, edit(b, [], 1));
    expect(f.control.execute(f.owner.actor, edit(b, [c], 2)).result['state']).toBe('backlog');
    expect(() =>
      f.control.execute(
        f.owner.actor,
        command('work.assign', { workId: b, agentId: f.senderId }, f.projectId, 3),
      ),
    ).toThrow('INVALID_TRANSITION');
    f.control.execute(f.owner.actor, edit(b, [], 3));
    f.control.execute(
      f.owner.actor,
      command('work.assign', { workId: b, agentId: f.senderId }, f.projectId, 4),
    );
    expect(() => f.control.execute(f.owner.actor, edit(b, [a], 5))).toThrow(
      'WORK_DEPENDENCIES_LOCKED',
    );
    expect(
      f.control
        .events(f.owner.actor, f.projectId, '0')
        .find((e) => e.type === 'work.create' && e.payload['id'] === b)?.payload['dependencies'],
    ).toEqual([a]);
  } finally {
    f.control.close();
  }
});
it('lays out DAG layers deterministically and diagnoses malformed graphs without recursion', () => {
  const edges = [
    { workId: 'b', dependsOn: 'a' },
    { workId: 'c', dependsOn: 'a' },
    { workId: 'd', dependsOn: 'b' },
    { workId: 'd', dependsOn: 'c' },
  ];
  const positions = taskPositions(['a', 'b', 'c', 'd'], edges);
  expect(positions.get('a')?.x).toBe(0);
  expect(positions.get('b')?.x).toBe(320);
  expect(positions.get('c')?.x).toBe(320);
  expect(positions.get('d')?.x).toBe(640);
  expect(taskPositions(['d', 'c', 'b', 'a'], edges)).toEqual(positions);
  expect(() =>
    taskPositions(
      ['a', 'b'],
      [
        { workId: 'a', dependsOn: 'b' },
        { workId: 'b', dependsOn: 'a' },
      ],
    ),
  ).toThrow('DAG_CYCLE');
  expect(() => taskPositions(['a'], [{ workId: 'a', dependsOn: 'missing' }])).toThrow(
    'DAG_DEPENDENCY_NOT_FOUND',
  );
});
