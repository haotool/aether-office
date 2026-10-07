import { CACHE_PREFIX, SKIP_WAITING, cacheName, handling } from './cache-rules.js';

// The service worker (built by scripts/build.mjs into dist/sw.js, with the precache list and version filled in).
// It keeps the page and its hashed files so that a page left open across a server rebuild still finds its chunks,
// and it waits for the person to agree before a new version takes over. It never caches an API answer.
declare const PRECACHE: readonly string[];
declare const VERSION: string;

type Extendable = Event & { waitUntil(work: Promise<unknown>): void };
type FetchEvent = Extendable & {
  request: Request;
  preloadResponse: Promise<Response | undefined>;
  respondWith(response: Promise<Response>): void;
};
type Worker = {
  location: { origin: string };
  registration: { navigationPreload: { enable(): Promise<void> } };
  clients: { claim(): Promise<void> };
  skipWaiting(): Promise<void>;
  addEventListener(type: 'install' | 'activate', listener: (event: Extendable) => void): void;
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void;
  addEventListener(type: 'message', listener: (event: Event & { data: unknown }) => void): void;
};
/** A service worker has no `window`; its global scope is this `self`. */
declare const self: Worker;
const worker = self;
const CACHE = cacheName(VERSION);

worker.addEventListener('install', (event) => {
  // The page is fetched fresh (`reload` skips the browser's HTTP cache); a hashed file never changes, so the copy the
  // page already downloaded is reused. One miss fails the install and the previous version stays in charge.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(
          PRECACHE.map((url) =>
            url === '/index.html' ? new Request(url, { cache: 'reload' }) : url,
          ),
        ),
      ),
  );
});

worker.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith(CACHE_PREFIX) && name !== CACHE) await caches.delete(name);
      await worker.registration.navigationPreload.enable();
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener('message', (event) => {
  if (event.data === SKIP_WAITING) void worker.skipWaiting();
});

worker.addEventListener('fetch', (event) => {
  const kind = handling(event.request, worker.location.origin);
  if (kind === 'network') return;
  event.respondWith(
    kind === 'asset'
      ? caches.match(event.request).then((hit) => hit ?? fetch(event.request))
      : (
          event.preloadResponse.then((early) => early ?? fetch(event.request)) as Promise<Response>
        ).catch(async () => (await caches.match('/index.html')) ?? Response.error()),
  );
});
