import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { networkInterfaces } from 'node:os';
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

/** The addresses a phone on this network can reach the server at (private IPv4 interfaces), with the port. */
export function lanOrigins(port: string): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal && isLanHostname(i.address))
    .map((i) => `http://${i!.address}:${port}`);
}

/** The pairing link for each address, with its QR code as an SVG. The code is in the fragment, never the query. */
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
