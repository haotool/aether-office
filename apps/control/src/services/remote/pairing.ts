import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import QRCode from 'qrcode';
import { DomainError } from '@aether/kernel';
import { isLanHostname } from '../platform/host-policy.js';

/**
 * Pairing a phone without typing a token. The code is 128 random bits, kept only as a hash, valid five minutes and once
 * (checked on the server). It travels in the URL fragment, so no server log or Referer holds it.
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

const rank = (address: string) =>
  /^(192\.168|10)\./.test(address) ? 0 : address.startsWith('172.') ? 1 : 2;

/**
 * The addresses a phone on this network can reach the server at, best first, with the port: private IPv4 on real
 * interfaces; link-local and virtual ones are skipped.
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

const QUIET_ZONE = 4;

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

export function pairingFailure(status: number | null, base: string, directory: string): string {
  if (status === null)
    return `Could not reach ${base}. Is the control plane running? Start it with pnpm start (or set AETHER_CONTROL_URL or PORT to where it listens).`;
  if (status === 401 || status === 403)
    return `${base} is running but did not accept the owner token in ${directory}. It probably uses another data directory: set AETHER_DATA_DIR to the one it was started with.`;
  return `${base} answered ${status} when asked for a pairing code.`;
}

export function pairingText(
  links: readonly { origin: string; url: string }[],
  ttlSeconds: number,
): string {
  const [first, ...others] = links;
  if (!first) throw new Error('PAIRING_LINK_REQUIRED');
  return [
    `\n${terminalQr(first.url)}\n\n${first.origin}`,
    ...(others.length
      ? [`Same code on the other addresses: ${others.map((link) => link.origin).join(', ')}`]
      : []),
    `Scan it with the phone's camera (same network). It works once and expires in ${ttlSeconds / 60} minutes.`,
    'Plain HTTP: the access token is not encrypted on the network, so use a network you trust.',
  ].join('\n');
}

/** The code is single-use, not the address, and travels in the URL fragment, never the query. */
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
