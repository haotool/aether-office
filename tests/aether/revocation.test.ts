import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { claim, enroll } from '../../apps/control/src/services/runners.js';
import { revoke } from '../../apps/control/src/services/identity.js';
import { createServer } from '../../apps/control/src/server.js';
import { command, fixture } from './fixture.js';
import { freePort } from './timing.js';

const PORT = await freePort();

it('revoking an identity stops new commands at once and closes its live event stream', async () => {
  const f = fixture();
  const app = createServer(f.control, { origin: `http://127.0.0.1:${PORT}` });
  await app.listen({ host: '127.0.0.1', port: PORT });
  try {
    const operator = f.control.createIdentity(f.owner.actor, {
      name: 'Soon revoked',
      role: 'operator',
      projectIds: [f.projectId],
    });
    const headers = { authorization: `Bearer ${operator.token}` };
    const work = () =>
      f.control.execute(
        operator.actor,
        command('work.create', { title: 'ok', description: '', acceptance: 'x' }, f.projectId),
      );
    expect(work).not.toThrow();

    const response = await fetch(
      `http://127.0.0.1:${PORT}/api/projects/${f.projectId}/stream?after=0`,
      { headers },
    );
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const first = decoder.decode((await reader.read()).value);
    expect(first.length).toBeGreaterThan(0); // the stream is live and delivering

    revoke(f.control.ctx, f.owner.actor, operator.actor.id);
    expect(work).toThrow('AUTH_REQUIRED'); // refused immediately, no grace period
    const afterRevoke = await fetch(
      `http://127.0.0.1:${PORT}/api/projects/${f.projectId}/snapshot`,
      { headers },
    );
    expect(afterRevoke.status).toBe(401);

    // The open stream reauthenticates on every tick: it reports a fault and ends instead of leaking data.
    let text = '';
    const deadline = Date.now() + 5000;
    for (;;) {
      const timeout = Math.max(1, deadline - Date.now());
      const chunk = await Promise.race([
        reader.read(),
        delay(timeout).then(() => ({ done: true, value: undefined, timedOut: true })),
      ]);
      if (chunk.value) text += decoder.decode(chunk.value);
      if (chunk.done) break;
    }
    expect(text).toContain('event: fault');
    expect(text).not.toContain('event: domain'); // nothing sensitive after the revocation
  } finally {
    await app.close();
    f.control.close();
  }
}, 20000);

it('a revoked machine can no longer claim work', () => {
  const f = fixture();
  try {
    const machine = enroll(f.control.ctx, f.owner.actor, 'Soon revoked', [f.projectId]);
    expect(() => claim(f.control.ctx, machine.actor, ['demo'])).not.toThrow();
    const identityId = (
      f.control.ctx.sqlite
        .prepare('SELECT id FROM identities WHERE machineId=?')
        .get(machine.machineId) as { id: string }
    ).id;
    revoke(f.control.ctx, f.owner.actor, identityId);
    expect(() => claim(f.control.ctx, machine.actor, ['demo'])).toThrow('AUTH_REQUIRED');
  } finally {
    f.control.close();
  }
});
