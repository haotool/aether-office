import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { DomainError } from '@aether/kernel';

// Outbound fetch for third-party URLs (connectors, A2A artifacts). Blocks SSRF into private networks
// and cloud metadata, pins the connection to the address that was validated, revalidates every
// redirect, and bounds time and size.

const ipv4 = (ip: string) => ip.split('.').map(Number) as [number, number, number, number];

function privateV4(ip: string): boolean {
  const [a, b] = ipv4(ip);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local incl. 169.254.169.254 metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return !privateV4(ip);
  if (kind !== 6) return false;
  const lower = ip.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(lower);
  if (mapped) return !privateV4(mapped[1]!);
  const first = parseInt(lower.split(':')[0] || '0', 16);
  return !(
    lower === '::' ||
    lower === '::1' ||
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xff00) === 0xff00 // multicast
  );
}

export type Resolver = (host: string) => Promise<string[]>;
const systemResolver: Resolver = async (host) =>
  (await dnsLookup(host, { all: true })).map((r) => r.address);

export type FetchPolicy = {
  resolver?: Resolver;
  isAllowed?: (ip: string) => boolean;
  ports?: readonly number[];
  maxBytes?: number;
  timeoutMs?: number;
  maxRedirects?: number;
};

export async function assertSafeUrl(
  raw: string,
  policy: FetchPolicy = {},
): Promise<{ url: URL; address: string }> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new DomainError('URL_INVALID', 400);
  }
  if (!['http:', 'https:'].includes(url.protocol))
    throw new DomainError('URL_SCHEME_FORBIDDEN', 400);
  if (url.username || url.password) throw new DomainError('URL_CREDENTIALS_FORBIDDEN', 400);
  const port = Number(url.port || (url.protocol === 'https:' ? 443 : 80));
  if (!(policy.ports ?? [80, 443]).includes(port)) throw new DomainError('URL_PORT_FORBIDDEN', 400);
  const host = url.hostname.replace(/^\[|\]$/g, '');
  const allowed = policy.isAllowed ?? isPublicAddress;
  const addresses = isIP(host) ? [host] : await (policy.resolver ?? systemResolver)(host);
  // Every resolved address must be public: a mixed answer is a rebinding trick.
  if (!addresses.length || !addresses.every(allowed))
    throw new DomainError('URL_ADDRESS_FORBIDDEN', 403);
  return { url, address: addresses[0]! };
}

function request(
  url: URL,
  address: string,
  policy: FetchPolicy,
): Promise<{ status: number; location?: string; body: Buffer }> {
  const maxBytes = policy.maxBytes ?? 1_048_576;
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'GET',
        timeout: policy.timeoutMs ?? 5000,
        headers: { 'user-agent': 'aether-office', accept: '*/*' },
        // Pin the socket to the validated address; the hostname is still used for SNI and Host.
        lookup: (_host, _options, callback) => callback(null, address, isIP(address)),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes) {
            reject(new DomainError('URL_RESPONSE_TOO_LARGE', 413));
            req.destroy();
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => {
          const location = res.headers.location;
          resolve({
            status: res.statusCode ?? 0,
            ...(location ? { location } : {}),
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on('timeout', () => {
      reject(new DomainError('URL_TIMEOUT', 504));
      req.destroy();
    });
    req.on('error', (error) =>
      reject(error instanceof DomainError ? error : new DomainError('URL_FETCH_FAILED', 502)),
    );
    req.end();
  });
}

export async function safeFetch(
  raw: string,
  policy: FetchPolicy = {},
): Promise<{ status: number; body: Buffer; finalUrl: string }> {
  let current = raw;
  for (let hop = 0; hop <= (policy.maxRedirects ?? 3); hop++) {
    const { url, address } = await assertSafeUrl(current, policy);
    const response = await request(url, address, policy);
    if (response.status >= 300 && response.status < 400 && response.location) {
      current = new URL(response.location, url).toString(); // revalidated at the top of the loop
      continue;
    }
    return { status: response.status, body: response.body, finalUrl: url.toString() };
  }
  throw new DomainError('URL_TOO_MANY_REDIRECTS', 400);
}
