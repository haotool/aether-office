import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';

// The worker script run against a synthetic worker scope: a Map-backed Cache Storage, real Request/Response objects, and
// `self` that records the listeners it registers. The routing rules themselves live in cache-rules.ts.
type Listener = (event: Record<string, unknown>) => void;
const ORIGIN = 'https://office.test';
const VERSION = 'v9';
const PRECACHE = ['/index.html', '/assets/app-abcd1234.js'];

class FakeCache {
  readonly urls: (string | Request)[] = [];
  constructor(readonly entries = new Map<string, Response>()) {}
  addAll(urls: (string | Request)[]) {
    this.urls.push(...urls);
    return Promise.resolve();
  }
}

let listeners: Map<string, Listener>;
let stores: Map<string, FakeCache>;
let calls: string[];
let fetched: string[];

function install(options: { failFetch?: boolean } = {}) {
  listeners = new Map();
  stores = new Map();
  calls = [];
  fetched = [];
  const worker = {
    location: { origin: ORIGIN },
    registration: {
      navigationPreload: { enable: () => (calls.push('preload'), Promise.resolve()) },
    },
    clients: { claim: () => (calls.push('claim'), Promise.resolve()) },
    skipWaiting: () => (calls.push('skipWaiting'), Promise.resolve()),
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
  };
  installGlobal('self', worker);
  // A worker resolves a relative request URL against its own origin; Node's Request wants an absolute one.
  const Native = Request;
  installGlobal(
    'Request',
    class extends Native {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        super(typeof input === 'string' ? new URL(input, ORIGIN).href : input, init);
      }
    },
  );
  installGlobal('PRECACHE', PRECACHE);
  installGlobal('VERSION', VERSION);
  installGlobal('caches', {
    open: (name: string) => {
      if (!stores.has(name)) stores.set(name, new FakeCache());
      return Promise.resolve(stores.get(name));
    },
    keys: () => Promise.resolve([...stores.keys()]),
    delete: (name: string) => Promise.resolve(stores.delete(name)),
    match: (request: Request | string) => {
      const url = typeof request === 'string' ? new URL(request, ORIGIN).href : request.url;
      for (const store of stores.values()) {
        const hit = store.entries.get(url);
        if (hit) return Promise.resolve(hit);
      }
      return Promise.resolve(undefined);
    },
  });
  installGlobal('fetch', (request: Request) => {
    fetched.push(request.url);
    return options.failFetch
      ? Promise.reject(new TypeError('offline'))
      : Promise.resolve(new Response('network'));
  });
}

/** Dispatches an event the way the browser does and returns the work it asked to wait for / respond with. */
function dispatch(type: string, extra: Record<string, unknown> = {}) {
  const work: Promise<unknown>[] = [];
  let response: Promise<Response> | undefined;
  listeners.get(type)!({
    waitUntil: (p: Promise<unknown>) => work.push(p),
    respondWith: (r: Promise<Response>) => (response = r),
    ...extra,
  });
  return { work: Promise.all(work), response };
}
beforeEach(async () => {
  vi.resetModules();
  install();
  await import('../../apps/web/src/sw/sw.js');
});
afterEach(() => {
  removeBrowserEnv();
});

describe('service worker', () => {
  it('precaches the shell into a cache named for the version, reloading the page itself', async () => {
    await dispatch('install').work;
    const cache = stores.get('aether-shell-v9')!;
    expect(cache.urls).toHaveLength(2);
    const [page, asset] = cache.urls as [Request, string];
    expect(page).toBeInstanceOf(Request);
    expect(page.cache).toBe('reload');
    expect(asset).toBe('/assets/app-abcd1234.js');
  });

  it('on activation drops only its own older caches, then claims clients with navigation preload on', async () => {
    stores.set('aether-shell-v8', new FakeCache());
    stores.set('aether-shell-v9', new FakeCache());
    stores.set('someone-elses', new FakeCache());
    await dispatch('activate').work;
    expect([...stores.keys()].sort()).toEqual(['aether-shell-v9', 'someone-elses']);
    expect(calls).toEqual(['preload', 'claim']);
  });

  it('takes over only when the page sends the skip-waiting message', () => {
    listeners.get('message')!({ data: 'something else' });
    expect(calls).toEqual([]);
    listeners.get('message')!({ data: 'aether-skip-waiting' });
    expect(calls).toEqual(['skipWaiting']);
  });

  it('answers a cached hashed asset from the cache and fetches a missing one', async () => {
    const url = `${ORIGIN}/assets/app-abcd1234.js`;
    const cache = new FakeCache(new Map([[url, new Response('cached')]]));
    stores.set('aether-shell-v9', cache);
    const hit = dispatch('fetch', { request: new Request(url) });
    expect(await (await hit.response!).text()).toBe('cached');
    const miss = dispatch('fetch', { request: new Request(`${ORIGIN}/assets/other-ffff0000.js`) });
    expect(await (await miss.response!).text()).toBe('network');
    expect(fetched).toEqual([`${ORIGIN}/assets/other-ffff0000.js`]);
  });

  it('never handles the API, other origins or non-GET requests', () => {
    for (const request of [
      new Request(`${ORIGIN}/api/local-sessions`),
      new Request('https://elsewhere.test/assets/app-abcd1234.js'),
      new Request(`${ORIGIN}/assets/app-abcd1234.js`, { method: 'POST' }),
    ])
      expect(dispatch('fetch', { request }).response).toBeUndefined();
  });

  it('serves a page navigation from the network, preferring the early preload response', async () => {
    const early = new Response('preloaded');
    const nav = Object.assign(new Request(`${ORIGIN}/office`), {});
    Object.defineProperty(nav, 'mode', { value: 'navigate' });
    const withPreload = dispatch('fetch', {
      request: nav,
      preloadResponse: Promise.resolve(early),
    });
    expect(await (await withPreload.response!).text()).toBe('preloaded');
    const without = dispatch('fetch', {
      request: nav,
      preloadResponse: Promise.resolve(undefined),
    });
    expect(await (await without.response!).text()).toBe('network');
  });

  it('falls back to the cached page when the server cannot be reached, then to an error', async () => {
    install({ failFetch: true });
    vi.resetModules();
    await import('../../apps/web/src/sw/sw.js');
    const nav = Object.assign(new Request(`${ORIGIN}/office`), {});
    Object.defineProperty(nav, 'mode', { value: 'navigate' });
    const event = { request: nav, preloadResponse: Promise.resolve(undefined) };
    const lost = await dispatch('fetch', event).response!;
    expect(lost.type).toBe('error');
    const shell = new FakeCache(new Map([[`${ORIGIN}/index.html`, new Response('shell')]]));
    stores.set('aether-shell-v9', shell);
    const offline = await dispatch('fetch', event).response!;
    expect(await offline.text()).toBe('shell');
  });
});
