import { it, expect } from 'vitest';
import { tmpdir } from 'node:os';
import { Control } from '../../apps/control/src/control.js';
import { enroll, heartbeat } from '../../apps/control/src/services/runtime/runners.js';
import {
  claimTerminalCommand,
  reportTerminalCommand,
  reportTerminalSnapshot,
  readTerminal,
  listTerminals,
  reconcileTerminals,
} from '../../apps/control/src/services/platform/terminals.js';
import { command } from './fixture.js';
it('persists scoped terminal commands, fences takeover and never redispatches uncertain input', () => {
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
        command('project.create', { name: 'PTY control fixture', root: tmpdir() }),
      ).result['id'],
    );
    const operator = control.createIdentity(owner.actor, {
      name: 'Operator',
      role: 'operator',
      projectIds: [projectId],
    });
    const viewer = control.createIdentity(owner.actor, {
      name: 'Viewer',
      role: 'viewer',
      projectIds: [projectId],
    });
    const machine = enroll(control.ctx, owner.actor, 'Fixture PTY host', [projectId]);
    const root = (
      control.ctx.sqlite.prepare('SELECT root FROM projects WHERE id=?').get(projectId) as {
        root: string;
      }
    ).root;
    heartbeat(
      control.ctx,
      machine.actor,
      [],
      [
        { name: 'fixture', hash: 'a'.repeat(64), root },
        { name: 'other-project-secret', hash: 'b'.repeat(64), root: '/not-this-project' },
      ],
    );
    expect(JSON.stringify(listTerminals(control.ctx, viewer.actor, projectId))).not.toContain(
      'other-project-secret',
    );
    const start = command(
      'terminal.start',
      { machineId: machine.machineId, profile: 'fixture', cols: 80, rows: 24 },
      projectId,
    );
    expect(() => control.execute(owner.actor, start)).toThrow('LIVE_EXECUTION_NOT_ENABLED');
    control.execute(
      owner.actor,
      command(
        'project.execution.configure',
        { liveEnabled: true, maxTurns: 1, timeoutMs: 10000 },
        projectId,
        0,
      ),
    );
    expect(() => control.execute(viewer.actor, start)).toThrow('FORBIDDEN');
    const receipt = control.execute(owner.actor, start);
    expect(control.execute(owner.actor, start)).toEqual(receipt);
    const cancelled = control.execute(
      owner.actor,
      command(
        'terminal.start',
        { machineId: machine.machineId, profile: 'fixture', cols: 80, rows: 24 },
        projectId,
      ),
    );
    const cancelledId = String(cancelled.result['id']);
    control.execute(
      owner.actor,
      command('terminal.stop', { terminalId: cancelledId, epoch: 0 }, projectId),
    );
    expect(readTerminal(control.ctx, viewer.actor, projectId, cancelledId)).toMatchObject({
      state: 'exited',
    });
    const terminalId = String(receipt.result['id']);
    const dispatched = claimTerminalCommand(control.ctx, machine.actor)!;
    expect(dispatched).toMatchObject({ kind: 'start', terminalId, profile: 'fixture' });
    expect(claimTerminalCommand(control.ctx, machine.actor)).toBeNull();
    reportTerminalCommand(control.ctx, machine.actor, {
      commandId: dispatched.id,
      status: 'applied',
    });
    const snapshot = {
      terminalId,
      state: 'running',
      processIdentity: 'synthetic-not-a-real-pty',
      cursor: 1,
      gap: false,
      chunks: [{ seq: 1, data: 'ANSI \u001b[32m狐狸' }],
      exit: null,
      dimensions: { cols: 80, rows: 24 },
    };
    reportTerminalSnapshot(control.ctx, machine.actor, snapshot);
    expect(readTerminal(control.ctx, viewer.actor, projectId, terminalId)).toMatchObject({
      state: 'running',
    });
    const listed = () =>
      listTerminals(control.ctx, viewer.actor, projectId).sessions.find((t) => t.id === terminalId);
    expect(listed()).toMatchObject({ agentState: 'unknown' });
    expect(readTerminal(control.ctx, viewer.actor, projectId, terminalId)).toMatchObject({
      agentState: 'unknown',
    });
    reportTerminalSnapshot(control.ctx, machine.actor, {
      ...snapshot,
      chunks: [{ seq: 1, data: '\u001b[2K✻ Cooking…\r\n❯ \r\n' }],
    });
    expect(listed()).toMatchObject({ agentState: 'working' });
    expect(readTerminal(control.ctx, viewer.actor, projectId, terminalId)).toMatchObject({
      agentState: 'working',
    });
    reportTerminalSnapshot(control.ctx, machine.actor, { ...snapshot, chunks: [] });
    expect(listed()).toMatchObject({ agentState: 'working' });
    const acquire = () =>
      control.execute(
        owner.actor,
        command('terminal.takeover', { terminalId, epoch: 0 }, projectId),
      );
    expect(acquire().result['controlEpoch']).toBe(1);
    expect(() =>
      control.execute(
        operator.actor,
        command('terminal.takeover', { terminalId, epoch: 1 }, projectId),
      ),
    ).toThrow('TERMINAL_ALREADY_CONTROLLED');
    expect(() =>
      control.execute(
        operator.actor,
        command('terminal.input', { terminalId, epoch: 1, text: 'forbidden' }, projectId),
      ),
    ).toThrow('TERMINAL_CONTROL_REQUIRED');
    const input = command(
      'terminal.input',
      { terminalId, epoch: 1, text: 'secret-keystrokes' },
      projectId,
    );
    const queued = control.execute(owner.actor, input);
    expect(control.execute(owner.actor, input)).toEqual(queued);
    const write = claimTerminalCommand(control.ctx, machine.actor)!;
    expect(write.payload['text']).toBe('secret-keystrokes');
    expect(JSON.stringify(control.events(owner.actor, projectId, '0'))).not.toContain(
      'secret-keystrokes',
    );
    now += 31000;
    heartbeat(control.ctx, machine.actor);
    expect(reconcileTerminals(control.ctx)).toBe(1);
    expect(claimTerminalCommand(control.ctx, machine.actor)).toBeNull();
    expect(readTerminal(control.ctx, viewer.actor, projectId, terminalId)).toMatchObject({
      state: 'indeterminate',
      controlOwner: null,
    });
    reportTerminalSnapshot(control.ctx, machine.actor, {
      ...snapshot,
      cursor: 2,
      chunks: [{ seq: 2, data: 'late output' }],
    });
    expect(readTerminal(control.ctx, viewer.actor, projectId, terminalId)).toMatchObject({
      state: 'indeterminate',
    });
    const late = { commandId: write.id, status: 'applied' };
    expect(reportTerminalCommand(control.ctx, machine.actor, late)).toEqual({ duplicate: false });
    expect(reportTerminalCommand(control.ctx, machine.actor, late)).toEqual({ duplicate: true });
    expect(
      control.ctx.sqlite
        .prepare('SELECT payload,state FROM terminal_commands WHERE id=?')
        .get(write.id),
    ).toEqual({ payload: '{}', state: 'indeterminate' });
    expect(() =>
      control.execute(
        owner.actor,
        command('terminal.takeover', { terminalId, epoch: 1 }, projectId),
      ),
    ).toThrow('TERMINAL_NOT_RUNNING');
    expect(() => reportTerminalSnapshot(control.ctx, machine.actor, snapshot)).toThrow(
      'TERMINAL_STALE_SNAPSHOT',
    );
    const outsider = control.createIdentity(owner.actor, {
      name: 'Outsider',
      role: 'viewer',
      projectIds: [],
    });
    expect(() => readTerminal(control.ctx, outsider.actor, projectId, terminalId)).toThrow(
      'PROJECT_FORBIDDEN',
    );
  } finally {
    control.close();
  }
});
