import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pairingFailure, pairingText } from './services/remote/pairing.js';
import { print, warn } from './stdio.js';

/**
 * `pnpm run pair`: shows a QR code in the terminal that signs a phone in. It asks the running control plane for a
 * one-time code with the owner token from the data directory (the token itself is never printed), then prints one QR code, for
 * the best address, and lists the others (the code is the same on every address). The code works once and expires in five minutes.
 */
const mode = process.argv.includes('--demo') ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
const base = process.env['AETHER_CONTROL_URL'] ?? `http://127.0.0.1:${process.env['PORT'] ?? 4310}`;
let token: string;
try {
  token = readFileSync(resolve(directory, 'owner-token'), 'utf8').trim();
} catch {
  warn(
    `No owner token in ${directory}. Start the control plane once (pnpm start), or set AETHER_DATA_DIR to its data directory.`,
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
    'This control plane is not open to the network, so a phone could not reach it.\n' +
      'Start it with AETHER_HOST=0.0.0.0 (for example: AETHER_HOST=0.0.0.0 pnpm start), then run this again.',
  );
  process.exit(1);
}
print(pairingText(made.links, made.ttlSeconds));
