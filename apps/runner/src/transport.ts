const LOOPBACK = ['127.0.0.1', 'localhost', '[::1]'];

/** Runners connect outbound only, and never send credentials over plain HTTP to a remote host. */
export function assertSecureControlUrl(raw: string): URL {
  const url = new URL(raw);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOOPBACK.includes(url.hostname)))
    throw new Error('TLS_REQUIRED');
  return url;
}
