import { isIPv4, isIPv6 } from 'node:net';

// The Host check keeps a web page on another site from reaching this server through DNS rebinding, so it never accepts
// a name: on loopback only the exact origin passes. With LAN access on, the same port is also accepted for an address
// that cannot be rebound: a literal on a private network (192.168.x.x, 10.x.x.x, Tailscale 100.64/10) or an mDNS
// `.local` name.
const ipv4Private = (ip: string) => {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127)
  );
};
const ipv6Private = (ip: string) => /^(::1|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(ip);

export function isLanHostname(hostname: string): boolean {
  const name = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIPv4(name)) return ipv4Private(name);
  if (isIPv6(name)) return ipv6Private(name);
  return name === 'localhost' || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/.test(name);
}

type HostPolicy = {
  host: (header: string | undefined) => boolean;
  origin: (header: string | undefined) => boolean;
};

export function hostPolicy(canonical: URL, lan: boolean): HostPolicy {
  const hostAllowed = (host: string) => {
    if (host === canonical.host) return true;
    if (!lan) return false;
    try {
      const url = new URL(`http://${host}`);
      return url.port === canonical.port && isLanHostname(url.hostname);
    } catch {
      return false;
    }
  };
  return {
    host: (header) => header !== undefined && hostAllowed(header),
    origin: (header) => {
      if (!header) return true;
      if (header === canonical.origin) return true;
      if (!lan) return false;
      try {
        const url = new URL(header);
        return url.protocol === 'http:' && hostAllowed(url.host);
      } catch {
        return false;
      }
    },
  };
}

/**
 * AETHER_TRUST_PROXY: addresses or CIDR ranges of the proxies whose `X-Forwarded-For` and `-Proto` headers are
 * believed. Only addresses are accepted (never "everything", never a hop count): trusting a peer that is not the proxy
 * would let any client name its own address.
 */
export function parseTrustProxy(value: string | undefined): string | undefined {
  if (value === undefined || value.trim() === '') return undefined;
  const entries = value.split(',').map((entry) => entry.trim());
  const valid = (entry: string) => {
    const [address, prefix, ...rest] = entry.split('/');
    const bits = isIPv4(address ?? '') ? 32 : 128;
    return (
      (isIPv4(address ?? '') || isIPv6(address ?? '')) &&
      rest.length === 0 &&
      (prefix === undefined || (/^\d{1,3}$/.test(prefix) && Number(prefix) <= bits))
    );
  };
  if (!entries.every(valid)) throw new Error('INVALID_TRUST_PROXY');
  return entries.join(',');
}
