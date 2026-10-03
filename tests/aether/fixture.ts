import { randomUUID } from 'node:crypto';
import { Control } from '../../apps/control/src/control.js';
import type { Actor } from '../../packages/kernel/src/index.js';
export function command(type: string, data: unknown, projectId?: string, expectedVersion?: number) {
  return {
    schemaVersion: 1,
    type,
    data,
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
    ...(projectId ? { projectId } : {}),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  };
}
export function fixture(file = ':memory:', clock?: () => number) {
  const control = new Control(file, {
    mode: 'demo',
    cursorSecret: 'fixed-test-cursor-secret-32-characters',
    ...(clock ? { now: clock } : {}),
  });
  const owner = control.createIdentity(undefined, {
    name: 'Test owner',
    role: 'owner',
    projectIds: ['*'],
  });
  const project = control.execute(
    owner.actor,
    command('project.create', { name: '測試 Project' }),
  ).result;
  const projectId = String(project['id']);
  const register = (name: string) =>
    String(
      control.execute(
        owner.actor,
        command(
          'agent.register',
          { name, role: 'Engineer', provider: 'demo', species: 'fox', color: '#6ADDE8' },
          projectId,
        ),
      ).result['id'],
    );
  const senderId = register('Sender');
  const recipientId = register('Recipient');
  const sender = control.createIdentity(owner.actor, {
    name: 'Sender credential',
    role: 'agent',
    projectIds: [projectId],
    agentId: senderId,
  });
  const recipient = control.createIdentity(owner.actor, {
    name: 'Recipient credential',
    role: 'agent',
    projectIds: [projectId],
    agentId: recipientId,
  });
  const send = (text: string, who: Actor = sender.actor, to = recipientId) =>
    control.execute(
      who,
      command('message.send', { recipients: [to], body: text, kind: 'inform' }, projectId),
    );
  return { control, owner, projectId, sender, recipient, senderId, recipientId, send, register };
}
