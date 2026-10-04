import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';
import { Control } from './control.js';
import { isLanHostname } from './services/host-policy.js';
import { createServer } from './server.js';
import { secret } from './services/identity.js';
import { reconcileTerminals } from './services/terminals.js';
import { reconcileOffline, reconcileStalled } from './services/runners.js';
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
// AETHER_HOST opens the server to other devices on the local network (a phone, a tablet). The default is this
// machine only. The address must be one the machine owns (0.0.0.0 or :: for every interface).
const host = process.env['AETHER_HOST'] ?? '127.0.0.1';
if (isIP(host) === 0) throw new Error('INVALID_HOST');
const lan = !['127.0.0.1', '::1'].includes(host);
const app = createServer(control, {
  origin,
  lan,
  serveWeb: process.env['AETHER_SERVE_WEB'] !== '0',
  logger: true,
});
const timer = setInterval(() => {
  reconcileOffline(control.ctx);
  reconcileStalled(control.ctx);
  reconcileTerminals(control.ctx);
}, 10000);
timer.unref();
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    clearInterval(timer);
    void app.close().finally(() => control.close());
  });
await app.listen({ host, port });
console.log(
  `AETHER ${mode.toUpperCase()}: ${origin}\nOwner access token is stored in ${tokenFile}. It is never embedded in the web bundle.`,
);
if (lan) {
  const addresses = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && isLanHostname(i.address) && !i.internal)
    .map((i) => `http://${i!.address}:${port}`);
  console.log(
    `LAN access is ON: open ${addresses.join(' or ') || '(no private-network address found)'} on a device on this network.\n` +
      'Plain HTTP: the access token crosses the network unencrypted, so use it only on a network you trust.',
  );
}
