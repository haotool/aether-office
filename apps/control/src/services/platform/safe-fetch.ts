import { lookup as dnsLookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';
import { DomainError } from '@aether/kernel';

// Blocks SSRF into private networks and cloud metadata, pins the connection to the validated address, revalidates every
// redirect and bounds time and size.

// IANA special-purpose ranges. Each IPv4 range is also refused behind the NAT64 prefix, so translated public hosts keep
// working; the IPv4-mapped, 6to4 and local NAT64 prefixes are refused whole.
const SPECIAL = `0.0.0.0/8 10.0.0.0/8 100.64.0.0/10 127.0.0.0/8 169.254.0.0/16 172.16.0.0/12 192.0.0.0/16 192.168.0.0/16
198.18.0.0/15 198.51.100.0/24 203.0.113.0/24 224.0.0.0/3 ::/96 ::ffff:0:0/96 64:ff9b:1::/48 100::/64 2001::/23
2001:db8::/32 2002::/16 fc00::/7 fe80::/10 fec0::/10 ff00::/8`;
const nat64 = (net: string) => {
  const [a = 0, b = 0, c = 0, d = 0] = net.split('.').map(Number);
  return `64:ff9b::${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
};
const special = { 4: new BlockList(), 6: new BlockList() };
for (const range of SPECIAL.split(/\s+/)) {
  const [net = '', length = ''] = range.split('/');
  const kind = isIP(net) as 4 | 6;
  special[kind].addSubnet(net, Number(length), `ipv${kind}`);
  if (kind === 4) special[6].addSubnet(nat64(net), 96 + Number(length), 'ipv6');
}

export function isPublicAddress(ip: string): boolean {
  const kind = isIP(ip);
  return (kind === 4 || kind === 6) && !special[kind].check(ip, `ipv${kind}`);
}

type Resolver = (host: string) => Promise<string[]>;
const systemResolver: Resolver = async (host) =>
  (await dnsLookup(host, { all: true })).map((r) => r.address);

type FetchInit = {
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
};

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
  const [address] = addresses;
  if (!address || !addresses.every(allowed)) throw new DomainError('URL_ADDRESS_FORBIDDEN', 403);
  return { url, address };
}

type Response = {
  status: number;
  location?: string;
  body: Buffer;
  headers: http.IncomingHttpHeaders;
};

function collectBody(
  req: http.ClientRequest,
  maxBytes: number,
  resolve: (response: Response) => void,
  reject: (error: Error) => void,
) {
  return (res: http.IncomingMessage) => {
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
        headers: res.headers,
      });
    });
  };
}

function request(
  url: URL,
  address: string,
  policy: FetchPolicy,
  init: FetchInit,
): Promise<Response> {
  const maxBytes = policy.maxBytes ?? 1_048_576;
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req: http.ClientRequest = client.request(
      url,
      {
        method: init.method ?? 'GET',
        headers: {
          'user-agent': 'aether-office',
          accept: '*/*',
          ...init.headers,
          ...(init.body === undefined
            ? {}
            : { 'content-length': String(Buffer.byteLength(init.body)) }),
        },
        lookup: (_host, _options, callback) => callback(null, address, isIP(address)),
      },
      (res) => collectBody(req, maxBytes, resolve, reject)(res),
    );
    // A total deadline: an idle timeout would let a server that drips bytes hold the connection open.
    const deadline = setTimeout(() => {
      reject(new DomainError('URL_TIMEOUT', 504));
      req.destroy();
    }, policy.timeoutMs ?? 5000);
    req.on('close', () => clearTimeout(deadline));
    req.on('error', (error) =>
      reject(error instanceof DomainError ? error : new DomainError('URL_FETCH_FAILED', 502)),
    );
    req.end(init.body);
  });
}

export async function safeFetch(
  raw: string,
  policy: FetchPolicy = {},
  init: FetchInit = {},
): Promise<{
  status: number;
  body: Buffer;
  finalUrl: string;
  headers: http.IncomingHttpHeaders;
}> {
  let current = raw;
  const origin = new URL(raw).origin;
  for (let hop = 0; hop <= (policy.maxRedirects ?? 3); hop++) {
    const { url, address } = await assertSafeUrl(current, policy);
    const response = await request(url, address, policy, init);
    if (response.status >= 300 && response.status < 400 && response.location) {
      // Credentials and request bodies never follow a redirect to somewhere else.
      if (init.method === 'POST' || (init.headers && url.origin !== origin))
        throw new DomainError('URL_REDIRECT_FORBIDDEN', 400);
      current = new URL(response.location, url).toString();
      if (init.headers && new URL(current).origin !== origin)
        throw new DomainError('URL_REDIRECT_FORBIDDEN', 400);
      continue;
    }
    return {
      status: response.status,
      body: response.body,
      finalUrl: url.toString(),
      headers: response.headers,
    };
  }
  throw new DomainError('URL_TOO_MANY_REDIRECTS', 400);
}
