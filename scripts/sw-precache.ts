import { createHash } from 'node:crypto';

// What the service worker keeps for offline and for a rebuilt server: the page and the hashed scripts and styles it names.
// Never the characters (large, not hashed), the icons, nor anything under /api (session data stays out of every cache).

/** Vite's output names (`assets/<name>-<8 character hash>.js|css`), the same rule the server uses for `immutable`. */
export const HASHED_ASSET = /^assets\/[^/]+-[\w-]{8}\.(js|css)$/;

/** The URLs to precache from the files of the web build (paths relative to its directory). */
export function precacheUrls(files: readonly string[]): string[] {
  const assets = files
    .map((file) => file.replaceAll('\\', '/'))
    .filter((file) => HASHED_ASSET.test(file));
  return ['/index.html', ...assets.sort().map((file) => `/${file}`)];
}

/** Changes whenever the page or any hashed file does: it names the cache and makes `sw.js` differ byte for byte. */
export function shellVersion(urls: readonly string[], indexHtml: string): string {
  return createHash('sha256')
    .update([...urls, indexHtml].join('\n'))
    .digest('hex')
    .slice(0, 12);
}
