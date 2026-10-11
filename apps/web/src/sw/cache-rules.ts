export const CACHE_PREFIX = 'aether-shell-';
export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`;
export const SKIP_WAITING = 'aether-skip-waiting';

const HASHED_ASSET = /^\/assets\/[^/]+-[\w-]{8}\.(js|css)$/;

type Handling = 'asset' | 'navigation' | 'network';

/**
 * Hashed assets come from the cache first (an open page keeps its own chunks after a rebuild); pages go network first.
 * Everything else is not handled at all, so no session data can ever be stored.
 */
export function handling(
  request: { method: string; mode: string; url: string },
  origin: string,
): Handling {
  if (request.method !== 'GET') return 'network';
  const url = new URL(request.url);
  if (url.origin !== origin || url.pathname.startsWith('/api/')) return 'network';
  if (HASHED_ASSET.test(url.pathname)) return 'asset';
  return request.mode === 'navigate' ? 'navigation' : 'network';
}
