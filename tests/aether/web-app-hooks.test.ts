import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeEventSource,
  installBrowserEnv,
  installGlobal,
  removeBrowserEnv,
  type BrowserEnv,
} from './fixtures/browser-env.js';
import { renderHook } from './fixtures/mini-react.js';

const env: BrowserEnv = installBrowserEnv();
const web = await vi.hoisted(async () => {
  const paths = await import('./fixtures/web-paths.js');
  return { react: paths.WEB_REACT, query: paths.WEB_QUERY };
});
vi.mock(web.react, () => import('./fixtures/mini-react.js'));
const client = { invalidateQueries: vi.fn(), clear: vi.fn() };
vi.mock(web.query, () => ({ useQueryClient: () => client, useQuery: () => ({ data: undefined }) }));

const {
  documentTitle,
  focusFeedRow,
  useAuthSession,
  useDocumentChrome,
  useDocumentTitle,
  useFocusRequest,
  useProjectStream,
  useQuickOpen,
  useTour,
} = await import('../../apps/web/src/lib/app/app-hooks.js');
const { TOUR_INTERVAL_MS, TOUR_STOPS } = await import('../../apps/web/src/lib/navigation/tour.js');

afterAll(removeBrowserEnv);
beforeEach(() => {
  client.invalidateQueries.mockClear();
  client.clear.mockClear();
  FakeEventSource.all = [];
  installGlobal('EventSource', FakeEventSource);
  env.storage.clear();
});

describe('documentTitle', () => {
  it('leads with how many things wait for the person, then the page, then the product', () => {
    expect(documentTitle('Sessions', 3)).toBe('(3) Sessions · AETHER OFFICE');
    expect(documentTitle('Sessions', 0)).toBe('Sessions · AETHER OFFICE');
    expect(documentTitle('', 0)).toBe('AETHER OFFICE');
  });

  it('sets the tab title when the page or the waiting count changes', () => {
    const doc = env.document as unknown as { title: string };
    const hook = renderHook(useDocumentTitle, 'Office', 0);
    expect(doc.title).toBe('Office · AETHER OFFICE');
    hook.rerender('Office', 2);
    expect(doc.title).toBe('(2) Office · AETHER OFFICE');
  });
});

describe('useDocumentChrome', () => {
  it('sets the theme and language of the document and paints the browser bars with the page surface', () => {
    const root = { dataset: {} as Record<string, string>, lang: '' };
    const metas = [
      { content: '', setAttribute: vi.fn((_: string, v: string) => (metas[0]!.content = v)) },
    ];
    Object.assign(env.document, {
      documentElement: root,
      querySelectorAll: () => metas,
    });
    installGlobal('getComputedStyle', () => ({ getPropertyValue: () => ' #123456 ' }));
    const hook = renderHook(useDocumentChrome, 'dark', 'zh-TW');
    expect(root.dataset['theme']).toBe('dark');
    expect(root.lang).toBe('zh-Hant');
    expect(metas[0]!.setAttribute).toHaveBeenCalledWith('content', '#123456');
    hook.rerender('light', 'en');
    expect(root).toMatchObject({ dataset: { theme: 'light' }, lang: 'en' });
  });
});

describe('useQuickOpen', () => {
  const key = (k: string, extra: Record<string, unknown> = {}) => {
    const prevent = vi.fn();
    const event = Object.assign(new Event('keydown'), {
      key: k,
      metaKey: false,
      ctrlKey: false,
      preventDefault: prevent,
      ...extra,
    });
    env.window.dispatchEvent(event);
    return prevent;
  };

  it('toggles on Ctrl+K or Cmd+K, in either case, and claims the key', () => {
    const hook = renderHook(useQuickOpen);
    expect(hook.current.open).toBe(false);
    expect(key('k', { ctrlKey: true })).toHaveBeenCalled();
    expect(hook.current.open).toBe(true);
    key('K', { metaKey: true });
    expect(hook.current.open).toBe(false);
  });

  it('leaves a plain k and other chords alone, and stops listening on unmount', () => {
    const hook = renderHook(useQuickOpen);
    expect(key('k')).not.toHaveBeenCalled();
    expect(key('j', { ctrlKey: true })).not.toHaveBeenCalled();
    expect(hook.current.open).toBe(false);
    hook.unmount();
    key('k', { ctrlKey: true });
    expect(hook.current.open).toBe(false);
  });
});

describe('useProjectStream', () => {
  const stream = () => FakeEventSource.all.at(-1)! as FakeEventSource & { onopen?: () => void };
  const mount = (over: { projectId?: string; enabled?: boolean; seq?: string } = {}) => {
    const offline = vi.fn();
    const args = { projectId: 'p1', enabled: true, seq: '41', ...over };
    const hook = renderHook(useProjectStream, args.projectId, args.enabled, args.seq, offline);
    return { offline, hook };
  };

  it('opens from the snapshot sequence and tells the page when it is reachable', () => {
    const { offline } = mount({ seq: 'a b' });
    expect(stream().url).toBe('/api/projects/p1/stream?after=a%20b');
    stream().onopen!();
    stream().fail();
    expect(offline.mock.calls).toEqual([[false], [true]]);
  });

  it('does not open without a project, a snapshot sequence, or permission', () => {
    mount({ projectId: undefined });
    mount({ seq: undefined });
    mount({ enabled: false });
    expect(FakeEventSource.all).toHaveLength(0);
  });

  it('refreshes the snapshot on a domain event and goes offline on a malformed one', () => {
    const { offline } = mount();
    stream().emit('domain', { type: 'work.created', seq: '42' });
    expect(offline).not.toHaveBeenCalled();
    expect(client.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['snapshot', 'p1'] });
    client.invalidateQueries.mockClear();
    stream().emit('domain', { nonsense: true });
    expect(offline).toHaveBeenCalledWith(true);
    expect(client.invalidateQueries).not.toHaveBeenCalled();
  });

  it('goes offline but still refreshes after a fault, and reopens when the sequence moves', () => {
    const { offline, hook } = mount();
    stream().emit('fault', {});
    expect(offline).toHaveBeenCalledWith(true);
    expect(client.invalidateQueries).toHaveBeenCalled();
    const first = stream();
    hook.rerender('p1', true, '99', offline);
    expect(first.closed).toBe(true);
    expect(stream().url).toContain('after=99');
  });
});

describe('useAuthSession', () => {
  const session = { actor: { id: 'u', role: 'owner', projectIds: [] }, mode: 'live' };
  const replaceState = vi.fn();
  let fetched: string[];
  const serve = (handler: (url: string) => Response) => {
    fetched = [];
    installGlobal('fetch', (url: string) => {
      fetched.push(url);
      return Promise.resolve(handler(url));
    });
  };
  beforeEach(() => {
    replaceState.mockClear();
    Object.assign(env.window, {
      location: { hash: '', pathname: '/office', search: '?a=1' },
      history: { replaceState },
    });
  });

  it('finds the signed-in person, gets a CSRF token when the tab has none, then reports it checked', async () => {
    serve((url) =>
      url === '/api/session/csrf'
        ? Response.json({ csrf: 'tok', expiresAt: Date.now() + 1000 })
        : Response.json(session),
    );
    const hook = renderHook(useAuthSession);
    expect(hook.current.checked).toBe(false);
    await vi.waitFor(() => expect(hook.current.checked).toBe(true));
    expect(hook.current.session).toEqual(session);
    expect(fetched).toEqual(['/api/session', '/api/session/csrf']);
  });

  it('is signed out when the server says so', async () => {
    serve(() => Response.json({ error: { code: 'UNAUTHENTICATED' } }, { status: 401 }));
    const hook = renderHook(useAuthSession);
    await vi.waitFor(() => expect(hook.current.checked).toBe(true));
    expect(hook.current.session).toBeNull();
  });

  it('keeps a pairing code out of the address bar once signed in', async () => {
    (env.window['location'] as { hash: string }).hash = '#pair=abc';
    serve(() => Response.json(session));
    env.storage.setItem('aether-csrf', 'have-one');
    const hook = renderHook(useAuthSession);
    await vi.waitFor(() => expect(replaceState).toHaveBeenCalledWith(null, '', '/office?a=1'));
    expect(hook.current.session).toEqual(session);
  });

  it('signs out, forgets the token and clears the cache, even when the server cannot be reached', async () => {
    serve(() => Response.json(session));
    env.storage.setItem('aether-csrf', 'tok');
    const hook = renderHook(useAuthSession);
    await vi.waitFor(() => expect(hook.current.session).toEqual(session));
    installGlobal('fetch', () => Promise.reject(new TypeError('offline')));
    await expect(hook.current.logout()).rejects.toThrow('offline');
    expect(hook.current.session).toBeNull();
    expect(client.clear).toHaveBeenCalled();
    expect(env.storage.getItem('aether-csrf')).toBeNull();
  });
});

describe('useFocusRequest', () => {
  it('flies to the member once it has a desk, then removes the request from the address', () => {
    const setFocus = vi.fn();
    const params = new URLSearchParams('focus=1&agent=x');
    const setParams = vi.fn(
      (update: (p: URLSearchParams) => URLSearchParams, _options?: { replace: boolean }) =>
        update(params),
    );
    const hook = renderHook(
      useFocusRequest,
      params,
      setParams as never,
      undefined as string | undefined,
      setFocus,
    );
    expect(setFocus).not.toHaveBeenCalled();
    hook.rerender(params, setParams as never, 'agent-1', setFocus);
    expect(setFocus).toHaveBeenCalledWith('agent-1');
    expect(params.has('focus')).toBe(false);
    expect(params.get('agent')).toBe('x');
    expect(setParams.mock.calls[0]![1]).toEqual({ replace: true });
  });

  it('does nothing for a link that did not ask for it', () => {
    const setFocus = vi.fn();
    renderHook(
      useFocusRequest,
      new URLSearchParams('agent=x'),
      vi.fn() as never,
      'agent-1',
      setFocus,
    );
    expect(setFocus).not.toHaveBeenCalled();
  });
});

describe('useTour', () => {
  it('moves the camera to each stop, advances on a timer and puts the camera back at the end', () => {
    vi.useFakeTimers();
    const setFocus = vi.fn();
    const tour = renderHook(useTour, setFocus);
    expect(tour.current.tour.status).toBe('idle');
    tour.current.act({ type: 'start', restore: 'home' });
    expect(setFocus).toHaveBeenLastCalledWith(TOUR_STOPS[0]);
    vi.advanceTimersByTime(TOUR_INTERVAL_MS);
    expect(setFocus).toHaveBeenLastCalledWith(TOUR_STOPS[1]);
    tour.current.act({ type: 'stop' });
    expect(setFocus).toHaveBeenLastCalledWith('home');
    expect(tour.current.tour.status).toBe('idle');
    vi.useRealTimers();
  });

  it('does not advance while paused, and an interruption leaves the camera where the person put it', () => {
    vi.useFakeTimers();
    const setFocus = vi.fn();
    const tour = renderHook(useTour, setFocus);
    tour.current.act({ type: 'start', restore: 'home' });
    tour.current.act({ type: 'pause' });
    setFocus.mockClear();
    vi.advanceTimersByTime(TOUR_INTERVAL_MS * 3);
    expect(setFocus).not.toHaveBeenCalled();
    tour.current.act({ type: 'interrupt' });
    expect(setFocus).not.toHaveBeenCalled();
    expect(tour.current.tour.status).toBe('idle');
    vi.useRealTimers();
  });
});

describe('focusFeedRow', () => {
  it('waits two frames for the panel to draw, then scrolls to the row and focuses it', () => {
    const frames: (() => void)[] = [];
    installGlobal('requestAnimationFrame', (f: () => void) => frames.push(f));
    installGlobal('CSS', { escape: (s: string) => s.replace(/"/g, '\\"') });
    const row = { scrollIntoView: vi.fn(), focus: vi.fn() };
    const selectors: string[] = [];
    Object.assign(env.document, {
      querySelector: (s: string) => (selectors.push(s), row),
    });
    focusFeedRow('local:a"b');
    expect(frames).toHaveLength(1);
    frames[0]!();
    frames[1]!();
    expect(selectors).toEqual(['.feed-row[data-agent="local:a\\"b"]']);
    expect(row.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
    expect(row.focus).toHaveBeenCalled();
  });
});
