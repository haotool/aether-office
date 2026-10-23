import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pairingFailure, pairingText } from './services/remote/pairing.js';
import { print, say, warn } from './stdio.js';

/** `pnpm run pair`: prints a one-time QR code that signs a phone in; the owner token is never printed. */
const mode = process.argv.includes('--demo') ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
const base = process.env['AETHER_CONTROL_URL'] ?? `http://127.0.0.1:${process.env['PORT'] ?? 4310}`;
let token: string;
try {
  token = readFileSync(resolve(directory, 'owner-token'), 'utf8').trim();
} catch {
  warn(
    say(
      `No owner token in ${directory}. Start the control plane once (pnpm start), or set AETHER_DATA_DIR to its data directory.`,
      `在 ${directory} 找不到擁有者權杖。請先啟動一次控制台（pnpm start），或把 AETHER_DATA_DIR 設成它的資料目錄。`,
    ),
  );
  process.exit(1);
}

const response = await fetch(`${base}/api/pairings`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, origin: base },
}).catch(() => null);
if (!response?.ok) {
  warn(pairingFailure(response?.status ?? null, base, directory));
  process.exit(1);
}
const made = (await response.json()) as {
  lan: boolean;
  ttlSeconds: number;
  links: { origin: string; url: string }[];
};
if (!made.lan || !made.links.length) {
  warn(
    say(
      'This control plane is not open to the network, so a phone could not reach it.\n' +
        'Start it with AETHER_HOST=0.0.0.0 (for example: AETHER_HOST=0.0.0.0 pnpm start), then run this again.',
      '這個控制台沒有對網路開放，手機連不到。\n' +
        '請用 AETHER_HOST=0.0.0.0 啟動（例如：AETHER_HOST=0.0.0.0 pnpm start），再執行一次。',
    ),
  );
  process.exit(1);
}
print(pairingText(made.links, made.ttlSeconds));
