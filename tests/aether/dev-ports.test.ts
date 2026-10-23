import { createServer, type AddressInfo } from 'node:net';
import { afterEach, expect, it, vi } from 'vitest';
import { portFree } from '../../scripts/ports.js';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it('tells a port something listens on from a free one', async () => {
  const taken = createServer();
  await new Promise<void>((done) => taken.listen(0, '127.0.0.1', done));
  const { port } = taken.address() as AddressInfo;
  expect(await portFree(port, '127.0.0.1')).toBe(false);
  await new Promise((done) => taken.close(done));
  expect(await portFree(port, '127.0.0.1')).toBe(true);
});

const uiServer = async (port?: string) => {
  vi.resetModules();
  vi.stubEnv('PORT', port);
  const { default: config } = await import('../../apps/web/vite.config.js');
  const proxy = config.server?.proxy as Record<string, { target: string }>;
  return {
    ui: config.server?.port,
    api: proxy['/api']?.target,
    health: proxy['/health']?.target,
  };
};

it('serves the UI one port above the control plane and proxies to it, 4310 by default', async () => {
  expect(await uiServer()).toEqual({
    ui: 4311,
    api: 'http://127.0.0.1:4310',
    health: 'http://127.0.0.1:4310',
  });
  expect(await uiServer('4500')).toEqual({
    ui: 4501,
    api: 'http://127.0.0.1:4500',
    health: 'http://127.0.0.1:4500',
  });
});
