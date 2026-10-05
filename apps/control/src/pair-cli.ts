import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

/**
 * `pnpm run pair`: shows a QR code in the terminal that signs a phone in. It asks the running control plane for a
 * one-time code with the owner token from the data directory (the token itself is never printed), then prints each link
 * and its QR code. The code works once and expires in five minutes.
 */
const mode = process.argv.includes('--demo') ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
const base = process.env['AETHER_CONTROL_URL'] ?? `http://127.0.0.1:${process.env['PORT'] ?? 4310}`;
const token = readFileSync(resolve(directory, 'owner-token'), 'utf8').trim();

const response = await fetch(`${base}/api/pairings`, {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, origin: base },
});
if (!response.ok) {
  console.error(
    `Could not ask ${base} for a pairing code (${response.status}). Is the control plane running?`,
  );
  process.exit(1);
}
const made = (await response.json()) as {
  lan: boolean;
  ttlSeconds: number;
  links: { origin: string; url: string }[];
};
if (!made.lan || !made.links.length) {
  console.error(
    'This control plane is not open to the network, so a phone could not reach it.\n' +
      'Start it with AETHER_HOST=0.0.0.0 (for example: AETHER_HOST=0.0.0.0 pnpm start), then run this again.',
  );
  process.exit(1);
}
for (const link of made.links) {
  console.log(`\n${link.origin}`);
  console.log(await QRCode.toString(link.url, { type: 'terminal', small: true }));
}
console.log(
  `Scan one with the phone's camera (same network). It works once and expires in ${made.ttlSeconds / 60} minutes.\n` +
    'Plain HTTP: use a network you trust.',
);
