import { it, expect } from 'vitest';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createCollaborationMcp } from '../../apps/runner/src/mcp.js';
it('bounds a stalled inbox HTTP request by the requested wait deadline', async () => {
  let requests = 0;
  const http = createServer((_req, res) => {
    requests++;
    res.on('error', () => {});
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('NO_ADDRESS');
  const server = createCollaborationMcp({
    url: `http://127.0.0.1:${address.port}`,
    token: 'x'.repeat(40),
    projectId: randomUUID(),
    agentId: randomUUID(),
    workId: randomUUID(),
    runId: randomUUID(),
  });
  const client = new Client({ name: 'wait-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
    const start = performance.now();
    const response = await client.callTool({
      name: 'wait_for_message',
      arguments: { timeoutMs: 100 },
    });
    expect(performance.now() - start).toBeLessThan(1500);
    expect(requests).toBe(1);
    expect(response.isError).not.toBe(true);
    expect(JSON.parse((response.content as { text: string }[])[0]!.text)).toEqual({
      timedOut: true,
      messages: [],
    });
  } finally {
    await client.close();
    await server.close();
    http.closeAllConnections();
    await new Promise<void>((resolve, reject) => http.close((e) => (e ? reject(e) : resolve())));
  }
}, 10000);
it('MCP cancellation aborts an in-flight inbox request without another poll', async () => {
  const abort = new AbortController();
  let requests = 0;
  let disconnected!: () => void;
  const closed = new Promise<void>((resolve) => {
    disconnected = resolve;
  });
  const http = createServer((_req, res) => {
    requests++;
    res.on('close', disconnected);
    abort.abort();
  });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const address = http.address();
  if (!address || typeof address === 'string') throw new Error('NO_ADDRESS');
  const server = createCollaborationMcp({
    url: `http://127.0.0.1:${address.port}`,
    token: 'x'.repeat(40),
    projectId: randomUUID(),
    agentId: randomUUID(),
    workId: randomUUID(),
    runId: randomUUID(),
  });
  const client = new Client({ name: 'cancel-test', version: '1' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  try {
    await server.connect(a);
    await client.connect(b);
    await expect(
      client.callTool({ name: 'wait_for_message', arguments: { timeoutMs: 25000 } }, undefined, {
        signal: abort.signal,
      }),
    ).rejects.toThrow();
    await closed;
    expect(requests).toBe(1);
  } finally {
    await client.close();
    await server.close();
    http.closeAllConnections();
    await new Promise<void>((resolve, reject) => http.close((e) => (e ? reject(e) : resolve())));
  }
}, 1500);
