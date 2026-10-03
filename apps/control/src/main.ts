import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { Control } from './control.js';
import { createServer } from './server.js';
import { secret } from './services/identity.js';
import { reconcileTerminals } from './services/terminals.js';
import { reconcileOffline } from './services/runners.js';
const mode = process.env['AETHER_MODE'] === 'demo' ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const cursorFile = resolve(directory, 'cursor-secret');
if (!existsSync(cursorFile)) writeFileSync(cursorFile, secret(), { mode: 0o600, flag: 'wx' });
const control = new Control(resolve(directory, 'control.sqlite'), {
  mode,
  cursorSecret: readFileSync(cursorFile, 'utf8'),
});
const tokenFile = resolve(directory, 'owner-token');
if (!control.ctx.sqlite.prepare('SELECT 1 FROM identities LIMIT 1').get()) {
  const owner = control.createIdentity(undefined, {
    name: 'Local owner',
    role: 'owner',
    projectIds: ['*'],
  });
  writeFileSync(tokenFile, owner.token, { mode: 0o600, flag: 'wx' });
}
const port = Number(process.env['PORT'] ?? 4310);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('INVALID_PORT');
const origin = `http://127.0.0.1:${port}`;
const app = createServer(control, {
  origin,
  serveWeb: process.env['AETHER_SERVE_WEB'] !== '0',
  logger: true,
});
const timer = setInterval(() => {
  reconcileOffline(control.ctx);
  reconcileTerminals(control.ctx);
}, 10000);
timer.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    clearInterval(timer);
    void app.close().finally(() => control.close());
  });
await app.listen({ host: '127.0.0.1', port });
console.log(
  `AETHER ${mode.toUpperCase()}: ${origin}\nOwner access token is stored in ${tokenFile}. It is never embedded in the web bundle.`,
);
