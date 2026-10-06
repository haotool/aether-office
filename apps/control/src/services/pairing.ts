import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import QRCode from 'qrcode';
import { DomainError } from '@aether/kernel';
import { isLanHostname } from './host-policy.js';

/**
 * Pairing a phone without typing a token: the signed-in owner asks for a code, the page shows it as a QR code, the phone
 * scans it and is signed in. What makes that safe, learned from the pairing flows of other projects (Orca, Nimbalyst):
 *
 *  - the code is 128 random bits, kept only as a hash, valid five minutes and **once** (checked here, on the server: a
 *    client-side expiry is no expiry);
 *  - it travels in the URL's fragment, which a browser never sends over the network, so it is in no server log and no
 *    Referer header; the page swaps it for a session at once and removes it from the address bar;
 *  - an unknown, used and expired code answer the same, so the answer teaches nothing;
 *  - a few codes at a time, and the person who made one can see whether it was used (nobody pairs unnoticed).
 */
export const PAIRING_TTL_MS = 5 * 60_000;
const MAX_OUTSTANDING = 5;

type Entry = { id: string; identityId: string; expiresAt: number; redeemedAt: number | null };
const hashOf = (code: string) => createHash('sha256').update(code).digest('hex');

export function createPairingStore(now: () => number) {
  const byHash = new Map<string, Entry>();
  const prune = () => {
    for (const [key, entry] of byHash)
      if (entry.expiresAt + PAIRING_TTL_MS < now()) byHash.delete(key);
  };
  return {
    create(identityId: string): { id: string; code: string; expiresAt: number } {
      prune();
      const waiting = [...byHash.values()].filter(
        (e) => e.identityId === identityId && !e.redeemedAt && e.expiresAt > now(),
      );
      if (waiting.length >= MAX_OUTSTANDING) throw new DomainError('PAIRING_LIMIT', 429);
      const code = randomBytes(16).toString('base64url');
      const entry = {
        id: randomUUID(),
        identityId,
        expiresAt: now() + PAIRING_TTL_MS,
        redeemedAt: null,
      };
      byHash.set(hashOf(code), entry);
      return { id: entry.id, code, expiresAt: entry.expiresAt };
    },
    /** The identity the code was made for, once; the same error for every way a code can be wrong. */
    redeem(code: string): string {
      const entry = byHash.get(hashOf(code));
      if (!entry || entry.redeemedAt || entry.expiresAt <= now())
        throw new DomainError('PAIRING_INVALID', 401);
      entry.redeemedAt = now();
      return entry.identityId;
    },
    status(id: string, identityId: string): 'pending' | 'paired' | 'expired' {
      const entry = [...byHash.values()].find((e) => e.id === id && e.identityId === identityId);
      if (!entry) return 'expired';
      return entry.redeemedAt ? 'paired' : entry.expiresAt > now() ? 'pending' : 'expired';
    },
  };
}
export type PairingStore = ReturnType<typeof createPairingStore>;

/** Interfaces that are not the network a phone is on: tunnels, containers, VMs, Apple's peer-to-peer links. */
const VIRTUAL_INTERFACE =
  /^(lo|utun|awdl|llw|bridge|docker|br-|veth|virbr|vmnet|vboxnet|zt|tailscale)/i;

/** Lower is better: home and office networks first, then 172.16/12, then anything else private (Tailscale, ...). */
const rank = (address: string) =>
  /^(192\.168|10)\./.test(address) ? 0 : address.startsWith('172.') ? 1 : 2;

/**
 * The addresses a phone on this network can reach the server at (private IPv4 on real interfaces; link-local and virtual
 * ones skipped), best first, with the port.
 */
export function lanOrigins(
  port: string,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): string[] {
  return Object.entries(interfaces)
    .filter(([name]) => !VIRTUAL_INTERFACE.test(name))
    .flatMap(([, list]) => list ?? [])
    .filter(
      (i) =>
        i.family === 'IPv4' &&
        !i.internal &&
        isLanHostname(i.address) &&
        !i.address.startsWith('169.254.'),
    )
    .map((i) => i.address)
    .sort((a, b) => rank(a) - rank(b))
    .map((address) => `http://${address}:${port}`);
}

const QUIET_ZONE = 4; // modules of blank border the QR standard asks for

/**
 * A QR code for a terminal: black on white (set explicitly, so it scans on a dark theme too), two modules per text row
 * as half blocks, a quiet zone around it and an even number of rows so no row is left half drawn.
 */
export function terminalQr(text: string): string {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: 'M' }).modules;
  const side = size + 2 * QUIET_ZONE;
  const dark = (row: number, column: number) => {
    const r = row - QUIET_ZONE;
    const c = column - QUIET_ZONE;
    return r >= 0 && c >= 0 && r < size && c < size && !!data[r * size + c];
  };
  const lines: string[] = [];
  for (let row = 0; row < side; row += 2) {
    let line = '';
    for (let column = 0; column < side; column++) {
      const top = dark(row, column);
      const bottom = dark(row + 1, column);
      line += top ? (bottom ? '█' : '▀') : bottom ? '▄' : ' ';
    }
    lines.push(`\u001b[30;47m${line}\u001b[0m`);
  }
  return lines.join('\n');
}

/** One link per address, all with the same code (the code is what is single-use, not the address), each with its QR code as an SVG. The code is in the fragment, never the query. */
export async function pairingLinks(origins: readonly string[], code: string) {
  return Promise.all(
    origins.map(async (origin) => {
      const url = `${origin}/#pair=${code}`;
      return {
        origin,
        url,
        svg: await QRCode.toString(url, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }),
      };
    }),
  );
}
