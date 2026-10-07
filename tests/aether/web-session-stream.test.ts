import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FakeEventSource,
  domEvent,
  installBrowserEnv,
  installGlobal,
  removeBrowserEnv,
  type BrowserEnv,
} from './fixtures/browser-env.js';
import { renderHook } from './fixtures/mini-react.js';

// The hook under test runs on synthetic stand-ins (labelled in fixtures/): React's hook runtime, zustand's hook, and a
// query client that records which keys were invalidated. The EventSource is driven by the test.
const web = await vi.hoisted(async () => {
  const paths = await import('./fixtures/web-paths.js');
  return { react: paths.WEB_REACT, zustand: paths.WEB_ZUSTAND, query: paths.WEB_QUERY };
});
vi.mock(web.react, () => import('./fixtures/mini-react.js'));
vi.mock(web.zustand, () => import('./fixtures/mini-zustand.js'));
const invalidated: unknown[][] = [];
const client = {
  invalidateQueries: ({ queryKey }: { queryKey: unknown[] }) => {
    invalidated.push(queryKey);
    return Promise.resolve();
  },
};
vi.mock(web.query, () => ({ useQueryClient: () => client }));

const { useLink, useLinkLive, useSessionStream } =
  await import('../../apps/web/src/features/use-session-stream.js');

let env: BrowserEnv;
const latest = () => FakeEventSource.all.at(-1)!;
const keys = () => invalidated.map((k) => k.join('/'));
const change = (seq: number, kinds: string[], key = 'claude:a') => ({ seq, key, kinds });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  invalidated.length = 0;
  FakeEventSource.all = [];
  env = installBrowserEnv();
  installGlobal('EventSource', FakeEventSource);
  installGlobal('navigator', { onLine: true });
  useLink.getState().dispatch({ type: 'reset' });
});
afterEach(() => {
  vi.useRealTimers();
  removeBrowserEnv();
});

describe('useSessionStream', () => {
  it('stays disconnected while disabled or without EventSource support', () => {
    renderHook(useSessionStream, false);
    expect(FakeEventSource.all).toHaveLength(0);
    delete (globalThis as Record<string, unknown>)['EventSource'];
    renderHook(useSessionStream, true);
    expect(FakeEventSource.all).toHaveLength(0);
  });

  it('goes live on hello and refetches everything once for the baseline', () => {
    renderHook(useSessionStream, true);
    expect(latest().url).toBe('/api/local-sessions/stream');
    expect(useLink.getState().status).toBe('connecting');
    latest().emit('hello', { seq: 7 });
    expect(useLink.getState().status).toBe('live');
    expect(useLinkLive()).toBe(true);
    expect(keys()).toEqual(['local-sessions', 'speech', 'transcript']);
    vi.advanceTimersByTime(0); // the token KPIs go through the throttle, whose first slot is free
    expect(keys()).toEqual(['local-sessions', 'speech', 'transcript', 'usage']);
  });

  it('batches changes into one deduplicated refresh and resumes from the last sequence', () => {
    renderHook(useSessionStream, true);
    latest().emit('hello', { seq: 1 });
    vi.advanceTimersByTime(0);
    invalidated.length = 0;
    latest().emit('session', change(2, ['state']));
    latest().emit('session', change(3, ['state', 'tool']));
    latest().emit('session', { nonsense: true });
    expect(keys()).toEqual([]);
    vi.advanceTimersByTime(120);
    expect(keys()).toEqual(['local-sessions']);
    latest().fail();
    vi.advanceTimersByTime(30_000);
    expect(FakeEventSource.all).toHaveLength(2);
    expect(latest().url).toBe('/api/local-sessions/stream?after=3');
  });

  it('throttles the token KPIs to one refetch per gap', () => {
    renderHook(useSessionStream, true);
    latest().emit('hello', { seq: 1 });
    vi.advanceTimersByTime(0); // the baseline refresh's own usage refetch fires
    invalidated.length = 0;
    latest().emit('session', change(2, ['transcript']));
    vi.advanceTimersByTime(120);
    expect(keys()).toContain('transcript/claude:a');
    expect(keys()).not.toContain('usage');
    vi.advanceTimersByTime(5_000);
    expect(keys().filter((k) => k === 'usage')).toHaveLength(1);
  });

  it('marks everything stale on a resync and adopts the server sequence', () => {
    renderHook(useSessionStream, true);
    latest().emit('hello', { seq: 1 });
    invalidated.length = 0;
    latest().emit('resync', { seq: 40 });
    expect(keys()).toContain('local-sessions');
    latest().fail();
    vi.advanceTimersByTime(30_000);
    expect(latest().url).toContain('after=40');
  });

  it('reports a lost connection, offline once the browser says so, and reconnects with backoff', () => {
    renderHook(useSessionStream, true);
    latest().emit('hello', { seq: 1 });
    const first = latest();
    first.fail();
    expect(first.closed).toBe(true);
    expect(useLink.getState().status).toBe('reconnecting');
    env.window.dispatchEvent(new Event('offline'));
    expect(useLink.getState().status).toBe('offline');
    env.window.dispatchEvent(new Event('online'));
    expect(FakeEventSource.all).toHaveLength(2);
    expect(useLink.getState().failures).toBe(2);
  });

  it('ignores an error from a connection it has already replaced', () => {
    renderHook(useSessionStream, true);
    const old = latest();
    env.window.dispatchEvent(new Event('online')); // resume: a new connection replaces the old one
    const failures = useLink.getState().failures;
    old.fail();
    expect(useLink.getState().failures).toBe(failures);
  });

  it('pauses while the tab is hidden and resyncs when it is shown again', () => {
    renderHook(useSessionStream, true);
    latest().emit('hello', { seq: 1 });
    const open = latest();
    env.document.visibilityState = 'hidden';
    env.document.dispatchEvent(new Event('visibilitychange'));
    expect(open.closed).toBe(true);
    expect(useLink.getState().status).toBe('connecting');
    invalidated.length = 0;
    env.document.visibilityState = 'visible';
    env.document.dispatchEvent(new Event('visibilitychange'));
    expect(FakeEventSource.all).toHaveLength(2);
    expect(keys()).toContain('speech');
  });

  it('does not connect when mounted in a hidden tab, and resumes only for a restored page', () => {
    env.document.visibilityState = 'hidden';
    renderHook(useSessionStream, true);
    expect(FakeEventSource.all).toHaveLength(0);
    env.window.dispatchEvent(domEvent('pageshow', { persisted: false }));
    expect(FakeEventSource.all).toHaveLength(0);
    env.document.visibilityState = 'visible';
    env.window.dispatchEvent(domEvent('pageshow', { persisted: true }));
    expect(FakeEventSource.all).toHaveLength(1);
  });

  it('closes the stream and removes its listeners on unmount', () => {
    const hook = renderHook(useSessionStream, true);
    latest().emit('hello', { seq: 1 });
    hook.unmount();
    expect(latest().closed).toBe(true);
    expect(useLink.getState().status).toBe('connecting');
    env.window.dispatchEvent(new Event('online'));
    expect(FakeEventSource.all).toHaveLength(1);
  });
});
