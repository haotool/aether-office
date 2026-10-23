import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { Control } from './control.js';
import { createServer } from './server.js';
import { parseTrustProxy } from './services/platform/host-policy.js';
import { secret } from './services/domain/identity.js';
import { lanOrigins, pairingText, requestPairing } from './services/remote/pairing.js';
import { reconcileTerminals } from './services/platform/terminals.js';
import { reconcileOffline, reconcileStalled } from './services/runtime/runners.js';
import { print, say } from './stdio.js';
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
  trustProxy: parseTrustProxy(process.env['AETHER_TRUST_PROXY']),
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
print(
  `AETHER ${mode.toUpperCase()}: ${origin}\n` +
    say(
      `Owner access token is stored in ${tokenFile}. It is never embedded in the web bundle.`,
      `擁有者存取權杖存放在 ${tokenFile}，不會嵌入網頁程式。`,
    ),
);
if (lan) {
  const addresses = lanOrigins(String(port));
  print(
    say(
      `LAN access is ON: open ${addresses.join(' or ') || '(no private-network address found)'} on a device on this network.\n` +
        'Plain HTTP: the access token crosses the network unencrypted, so use it only on a network you trust.',
      `區域網路存取已開啟：請在同一網路的裝置開啟 ${addresses.join(' 或 ') || '（找不到私有網路位址）'}。\n` +
        '這是純 HTTP：存取權杖在網路上沒有加密，只在你信任的網路使用。',
    ),
  );
  if (process.env['AETHER_HOST']) {
    const base = `http://${['0.0.0.0', '::'].includes(host) ? '127.0.0.1' : host}:${port}`;
    const token = existsSync(tokenFile) ? readFileSync(tokenFile, 'utf8').trim() : '';
    const { offer } = await requestPairing(base, token);
    print(
      offer
        ? pairingText(offer.links, offer.ttlSeconds)
        : say(
            'Run `pnpm run pair` for a QR code that signs a phone in.',
            '執行 `pnpm run pair` 取得讓手機登入的 QR code。',
          ),
    );
  }
} else {
  print(
    say(
      'Only this computer can connect. To use it from a phone on your network: AETHER_HOST=0.0.0.0 pnpm start (a QR code is then shown here).',
      '只有這台電腦能連線。要在同一網路的手機上使用：AETHER_HOST=0.0.0.0 pnpm start（終端機會顯示 QR code）。',
    ),
  );
}
