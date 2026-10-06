import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { Control } from './control.js';
import { createServer } from './server.js';
import { secret } from './services/identity.js';
import { lanOrigins, pairingText } from './services/pairing.js';
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
// E2E only: these addresses stand in for the machine's own, and turn the LAN rules on while it still listens on loopback.
const fixedLan = process.env['AETHER_E2E_LAN_ADDRESSES']?.split(',');
const lan = fixedLan !== undefined || !['127.0.0.1', '::1'].includes(host);
const app = createServer(control, {
  origin,
  lan,
  lanAddresses:
    fixedLan && ((lanPort) => fixedLan.map((address) => `http://${address}:${lanPort}`)),
  serveWeb: process.env['AETHER_SERVE_WEB'] !== '0',
  dataDir: directory,
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
  const addresses = lanOrigins(String(port));
  console.log(
    `LAN access is ON: open ${addresses.join(' or ') || '(no private-network address found)'} on a device on this network.\n` +
      'Plain HTTP: the access token crosses the network unencrypted, so use it only on a network you trust.',
  );
  // A phone can be signed in right away: the same one-time code `pnpm run pair` makes, shown as a QR code.
  if (process.env['AETHER_HOST']) {
    const base = `http://${['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host}:${port}`;
    try {
      const response = await fetch(`${base}/api/pairings`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${readFileSync(tokenFile, 'utf8').trim()}`,
          origin: base,
        },
      });
      const made = (await response.json()) as {
        ttlSeconds: number;
        links: { origin: string; url: string }[];
      };
      console.log(pairingText(made.links, made.ttlSeconds));
    } catch {
      console.log('Run `pnpm run pair` for a QR code that signs a phone in.');
    }
  }
} else {
  console.log(
    'Only this computer can connect. To use it from a phone on your network: AETHER_HOST=0.0.0.0 pnpm start (a QR code is then shown here).',
  );
}
