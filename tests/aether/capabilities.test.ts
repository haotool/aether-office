import { expect, it } from 'vitest';
import { CAPABILITIES, capabilitiesOf, supports } from '../../packages/kernel/src/index.js';
import { command, fixture } from './fixture.js';
import { createServer } from '../../apps/control/src/server.js';

it('only claims capabilities that are implemented; unknown providers support nothing', () => {
  expect(supports('codex', 'resume')).toBe(true);
  expect(supports('demo', 'resume')).toBe(false);
  expect(supports('acp', 'start')).toBe(true); // via the negotiated generic adapter
  expect(supports('acp', 'resume')).toBe(false); // only per-agent negotiation could enable this
  expect(supports('acp', 'subagents')).toBe(false);
  expect(supports('mystery', 'start')).toBe(false);
  for (const provider of ['codex', 'claude'] as const) {
    expect(capabilitiesOf(provider).subagents).toBe(false); // disabled in both adapters
    expect(capabilitiesOf(provider).fork).toBe(false);
  }
  // No adapter injects into a running turn, so messages must wait in the durable inbox.
  expect(Object.values(CAPABILITIES).every((c) => c.messageInjection === 'none')).toBe(true);
});

it('never marks a message injected for a busy provider: it stays available in the inbox', async () => {
  const f = fixture();
  const app = createServer(f.control, { origin: 'http://127.0.0.1:4492' });
  try {
    f.control.ctx.sqlite
      .prepare("UPDATE agents SET activity='working' WHERE id=?")
      .run(f.recipientId);
    f.control.execute(
      f.sender.actor,
      command(
        'message.send',
        { recipients: [f.recipientId], body: 'while busy', kind: 'inform' },
        f.projectId,
      ),
    );
    const page = f.control.inbox(f.recipient.actor, f.projectId, {
      recipientId: f.recipientId,
      filter: 'pending',
      limit: 10,
    });
    expect(page.messages.map((m) => m.delivery.state)).toEqual(['available']);
    const response = await app.inject({
      method: 'GET',
      url: '/api/capabilities',
      headers: { authorization: `Bearer ${f.owner.token}`, host: '127.0.0.1:4492' },
    });
    expect(response.json().providers.claude.messageInjection).toBe('none');
  } finally {
    await app.close();
    f.control.close();
  }
});
