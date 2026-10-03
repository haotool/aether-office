import { it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Control } from '../../apps/control/src/control.js';
import { createServer } from '../../apps/control/src/server.js';
import {
  enroll,
  claim,
  report,
  sessionCredential,
} from '../../apps/control/src/services/runners.js';
import { command } from './fixture.js';
it('MCP stdio uses durable scoped inbox/replies, stable retries and expiring run credentials', async () => {
  const control = new Control(':memory:', { mode: 'live' });
  const app = createServer(control, { origin: 'http://127.0.0.1:4329' });
  const owner = control.createIdentity(undefined, {
    name: 'MCP test owner',
    role: 'owner',
    projectIds: ['*'],
  });
  const projectId = String(
    control.execute(owner.actor, command('project.create', { name: 'MCP test' })).result['id'],
  );
  const agentId = String(
    control.execute(
      owner.actor,
      command(
        'agent.register',
        {
          name: 'MCP fixture',
          provider: 'codex',
          role: 'Engineer',
          species: 'fox',
          color: '#abcdef',
        },
        projectId,
      ),
    ).result['id'],
  );
  const workId = String(
    control.execute(
      owner.actor,
      command(
        'work.create',
        { title: 'MCP transport', description: '', acceptance: 'Scope enforced' },
        projectId,
      ),
    ).result['id'],
  );
  control.execute(
    owner.actor,
    command(
      'project.execution.configure',
      { liveEnabled: true, maxTurns: 1, timeoutMs: 30000 },
      projectId,
      0,
    ),
  );
  control.execute(owner.actor, command('work.assign', { workId, agentId }, projectId, 1));
  const machine = enroll(control.ctx, owner.actor, 'MCP fixture', [projectId]);
  const run = claim(control.ctx, machine.actor, ['codex'])!;
  const credential = sessionCredential(control.ctx, machine.actor, run.runId, run.epoch);
  const transport = new StdioClientTransport({
    command: process.execPath,
    args:
      process.env['AETHER_TEST_BUILT'] === '1'
        ? [resolve('apps/runner/dist/mcp.js')]
        : ['--import', import.meta.resolve('tsx'), resolve('apps/runner/src/mcp-main.ts')],
    env: {
      PATH: process.env['PATH'] ?? '',
      AETHER_MCP_URL: 'http://127.0.0.1:4329',
      AETHER_MCP_TOKEN: credential.token,
      AETHER_MCP_PROJECT: projectId,
      AETHER_MCP_AGENT: agentId,
      AETHER_MCP_WORK: workId,
      AETHER_MCP_RUN: run.runId,
    },
    stderr: 'pipe',
  });
  let waiting = false;
  let sawPoll!: () => void;
  const polled = new Promise<void>((resolve) => {
    sawPoll = resolve;
  });
  app.addHook('onRequest', async (request) => {
    if (waiting && request.url.includes('/inbox?')) sawPoll();
  });
  const client = new Client({ name: 'synthetic-mcp-test', version: '1' });
  let stderr = '';
  transport.stderr?.on('data', (bytes) => {
    stderr += String(bytes);
  });
  try {
    await app.listen({ host: '127.0.0.1', port: 4329 });
    await client.connect(transport);
    const list = await client.listTools();
    expect(list.tools.map((t) => t.name)).toEqual(
      expect.arrayContaining(['get_inbox', 'reservations_acquire', 'reservations_list']),
    );
    const reserve = await client.callTool({
      name: 'reservations_acquire',
      arguments: { patterns: ['src/mcp/**'], idempotencyKey: 'reserve-mcp-key' },
    });
    expect(reserve.isError).not.toBe(true);
    expect(JSON.parse((reserve.content as { text: string }[])[0]!.text).result.granted).toBe(true);
    const reserved = await client.callTool({ name: 'reservations_list', arguments: {} });
    expect(JSON.stringify(reserved)).toContain('src/mcp/**');
    const nonce = randomUUID();
    const sent = control.execute(
      owner.actor,
      command(
        'message.send',
        { recipients: [agentId], body: `Reply nonce ${nonce}`, kind: 'request' },
        projectId,
      ),
    );
    const waits = await client.callTool({
      name: 'get_request_status',
      arguments: { messageId: sent.result['id'] },
    });
    expect(waits.isError).not.toBe(true);
    expect(JSON.stringify(waits)).toContain('pending');
    const inbox = await client.callTool({ name: 'get_inbox', arguments: {} });
    expect(JSON.stringify(inbox)).toContain(nonce);
    expect(
      control.inbox(control.authenticate(credential.token), projectId, { recipientId: agentId })
        .messages,
    ).toHaveLength(1);
    const args = {
      recipients: [owner.actor.id],
      body: `Nonce ${nonce}`,
      replyTo: sent.result['id'],
      idempotencyKey: 'same-reply-retry-key',
    };
    const first = await client.callTool({ name: 'send_message', arguments: args });
    expect(first.isError).not.toBe(true);
    const second = await client.callTool({ name: 'send_message', arguments: args });
    expect(second).toEqual(first);
    expect(
      control.inbox(owner.actor, projectId, { recipientId: owner.actor.id }).messages[0]?.body,
    ).toBe(`Nonce ${nonce}`);
    const forbidden = await client.callTool({
      name: 'get_inbox',
      arguments: { recipientId: owner.actor.id },
    });
    // Unknown fields can be stripped by MCP; the fixed authenticated recipient
    // still prevents a payload from changing whose inbox is read.
    expect(JSON.stringify(forbidden)).not.toContain(`Nonce ${nonce}`);
    const resources = await client.listResources();
    expect(resources.resources[0]?.uri).toBe(`aether://session/${run.runId}`);
    waiting = true;
    const pending = client.callTool({ name: 'wait_for_message', arguments: { timeoutMs: 25000 } });
    await polled;
    const current = control.snapshot(owner.actor, projectId).work.find((w) => w.id === workId)!;
    control.execute(owner.actor, command('work.cancel', { workId }, projectId, current.version));
    const interrupted = await pending;
    expect(interrupted.isError).toBe(true);
    expect(JSON.stringify(interrupted)).toContain('CONTROL_HTTP_401');
    report(control.ctx, machine.actor, {
      type: 'result',
      sourceEventId: randomUUID(),
      runId: run.runId,
      epoch: run.epoch,
      outcome: 'cancelled',
      summary: 'Synthetic test finished; no provider model started.',
    });
    expect(() => control.authenticate(credential.token)).toThrow('SESSION_CREDENTIAL_EXPIRED');
    expect((await client.callTool({ name: 'whoami', arguments: {} })).isError).toBe(true);
    expect(stderr).not.toContain(credential.token);
  } finally {
    await client.close();
    await app.close();
    control.close();
  }
}, 15000);
