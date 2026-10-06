// What the service worker answers from its cache, and what it never touches. Pure so the rules can be tested.

export const CACHE_PREFIX = 'aether-shell-';
export const cacheName = (version: string) => `${CACHE_PREFIX}${version}`;
/** The page tells a waiting worker to take over with this message, once the person agreed to reload. */
export const SKIP_WAITING = 'aether-skip-waiting';

/** Vite's hashed script and style names under /assets (the rule the server uses for `immutable`). */
const HASHED_ASSET = /^\/assets\/[^/]+-[\w-]{8}\.(js|css)$/;

export type Handling = 'asset' | 'navigation' | 'network';

/**
 * 'asset': a hashed file, answered from the cache first (an open page keeps its own chunks after a rebuild).
 * 'navigation': the page itself, network first, the cached copy only when the server cannot be reached.
 * 'network': everything else (the API, the event stream, health, characters, icons): not handled at all, so no
 * session data can ever be stored.
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
