import { isIPv4, isIPv6 } from 'node:net';

// Which Host and Origin headers a request may carry. The Host check is what keeps a web page on another site from
// reaching this server through DNS rebinding, so it never accepts a name: on the loopback address only the exact
// origin passes; with LAN access on, the same port is also accepted for an address that cannot be rebound because it
// is a literal on a private network (192.168.x.x, 10.x.x.x, a Tailscale 100.64/10 address, ...) or an mDNS `.local` name.
const ipv4Private = (ip: string) => {
  const [a, b] = ip.split('.').map(Number) as [number, number];
  return (
    a === 10 ||
    a === 127 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) || // link-local
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT, which is what Tailscale hands out
  );
};
const ipv6Private = (ip: string) => /^(::1|f[cd][0-9a-f]{2}:|fe[89ab][0-9a-f]:)/i.test(ip);

/** Pure. Is this host name an address on a private network, or an mDNS name? */
export function isLanHostname(hostname: string): boolean {
  const name = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (isIPv4(name)) return ipv4Private(name);
  if (isIPv6(name)) return ipv6Private(name);
  return name === 'localhost' || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.local$/.test(name);
}

export type HostPolicy = {
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
      if (!header) return true; // no Origin header: not a cross-site request
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
