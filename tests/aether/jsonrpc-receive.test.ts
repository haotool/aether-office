import { describe, expect, it } from 'vitest';
import { JsonRpcProcess } from '../../packages/providers/src/jsonrpc.js';

const peer = (body: string) =>
  new JsonRpcProcess(process.execPath, ['-e', body], { cwd: process.cwd() });

const PRELUDE = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const send = (v) => process.stdout.write(JSON.stringify(v) + '\\n');
`;

type ReceiveHarness = Pick<
  JsonRpcProcess,
  'onNotification' | 'onRequest' | 'ready' | 'close' | 'child' | 'request'
> & { receive: (input: unknown) => void };

function withReceive(rpc: JsonRpcProcess): ReceiveHarness {
  return rpc as unknown as ReceiveHarness;
}

describe('JsonRpcProcess.receive', () => {
  it('delivers notifications without an id', async () => {
    const rpc = withReceive(peer(`${PRELUDE} rl.on('line', () => {});`));
    const seen: string[] = [];
    rpc.onNotification = (method, params) => void seen.push(`${method}:${JSON.stringify(params)}`);
    await rpc.ready;
    rpc.receive({ method: 'tick', params: { n: 1 } });
    expect(seen).toEqual(['tick:{"n":1}']);
    rpc.close();
  });

  it('resolves client requests and rejects RPC errors', async () => {
    const rpc = peer(`${PRELUDE}
      rl.on('line', (line) => {
        const m = JSON.parse(line);
        if (m.method === 'ok') send({ id: m.id, result: 42 });
        if (m.method === 'bad') send({ id: m.id, error: { code: -32000, message: 'nope' } });
      });`);
    await rpc.ready;
    await expect(rpc.request('ok', {})).resolves.toBe(42);
    await expect(rpc.request('bad', {})).rejects.toThrow(/^RPC_ERROR:/);
    rpc.close();
  });

  it('answers server requests asynchronously and ignores unknown response ids', async () => {
    const rpc = withReceive(peer(`${PRELUDE} rl.on('line', () => {});`));
    const handled: unknown[] = [];
    rpc.onRequest = async (_method, params) => {
      handled.push(params);
      return { ok: true };
    };
    await rpc.ready;
    rpc.receive({ id: 9, result: 'ignored' });
    rpc.receive({ id: 'srv', method: 'ask', params: { q: 1 } });
    await new Promise((r) => setTimeout(r, 50));
    expect(handled).toEqual([{ q: 1 }]);
    rpc.close();
  });

  it('rejects duplicate server request ids with different payloads', async () => {
    const rpc = withReceive(peer(`${PRELUDE} rl.on('line', () => {});`));
    rpc.onRequest = async () => 'ok';
    await rpc.ready;
    rpc.receive({ id: 'dup', method: 'a', params: { v: 1 } });
    expect(() => rpc.receive({ id: 'dup', method: 'a', params: { v: 2 } })).toThrow(
      'SERVER_REQUEST_ID_REUSED',
    );
    rpc.close();
  });

  it('enforces the server-request limit and requires ids on responses', async () => {
    const rpc = withReceive(peer(`${PRELUDE} rl.on('line', () => {});`));
    rpc.onRequest = async () => 'ok';
    await rpc.ready;
    for (let i = 0; i < 256; i++) rpc.receive({ id: `id-${i}`, method: 'm', params: {} });
    expect(() => rpc.receive({ id: 'overflow', method: 'm', params: {} })).toThrow(
      'SERVER_REQUEST_LIMIT',
    );
    expect(() => rpc.receive({ result: 1 })).toThrow('RPC_ID_REQUIRED');
    rpc.close();
  });

  it('writes a JSON-RPC error when the server handler rejects', async () => {
    const rpc = withReceive(peer(`${PRELUDE} rl.on('line', () => {});`));
    const written: string[] = [];
    const stdin = rpc.child.stdin;
    const original = stdin.write.bind(stdin);
    stdin.write = ((chunk: string | Uint8Array, ...rest: unknown[]) => {
      written.push(String(chunk));
      return original(chunk as never, ...(rest as never[]));
    }) as typeof stdin.write;
    rpc.onRequest = async () => {
      throw new Error('denied');
    };
    await rpc.ready;
    rpc.receive({ id: 'srv', method: 'boom', params: {} });
    await new Promise((r) => setTimeout(r, 80));
    expect(written.some((line) => line.includes('"code":-32603'))).toBe(true);
    rpc.close();
  });
});
