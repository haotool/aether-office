import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../apps/web/src/features/conversation/turn-groups.js';
import { create } from './fixtures/mini-zustand.js';
import {
  installBrowserEnv,
  installGlobal,
  removeBrowserEnv,
  type BrowserEnv,
} from './fixtures/browser-env.js';
import { renderHook } from './fixtures/mini-react.js';

// Hooks that touch the DOM, on a synthetic hook runtime (fixtures/mini-react.ts) and tiny element fakes: the repo's vitest
// has no DOM environment. The preferences store is replaced by a plain store with the two fields the layout reads.
const web = await vi.hoisted(async () => {
  const paths = await import('./fixtures/web-paths.js');
  return { react: paths.WEB_REACT };
});
vi.mock(web.react, () => import('./fixtures/mini-react.js'));
type Prefs = {
  panelWidth: number | null;
  panelCollapsed: boolean;
  set: (n: Partial<Prefs>) => void;
};
const prefs = create<Prefs>((set) => ({ panelWidth: null, panelCollapsed: false, set }));
vi.mock('../../apps/web/src/lib/preferences/state.js', () => ({ usePreferences: prefs }));

const { usePanelLayout } = await import('../../apps/web/src/features/sessions/use-panel-layout.js');
const { useScrollSpy } = await import('../../apps/web/src/features/settings/useScrollSpy.js');
const { useConvKeys } = await import('../../apps/web/src/features/conversation/use-conv-keys.js');
const { useConvScroll } =
  await import('../../apps/web/src/features/conversation/use-conv-scroll.js');

let env: BrowserEnv;
beforeEach(() => {
  env = installBrowserEnv();
  prefs.setState({ panelWidth: null, panelCollapsed: false });
});
afterAll(removeBrowserEnv);

describe('usePanelLayout', () => {
  const resize = (width: number) => {
    env.window['innerWidth'] = width;
    env.window.dispatchEvent(new Event('resize'));
  };

  it('uses the default width for the window and follows the window as it resizes', () => {
    env.window['innerWidth'] = 1400;
    const layout = renderHook(usePanelLayout);
    expect(layout.current).toMatchObject({
      viewport: 1400,
      width: 380,
      occupied: 380,
      resizable: true,
    });
    resize(1900);
    expect(layout.current.width).toBe(440);
  });

  it('pulls a stored width inside the limits of a smaller window and gives it back when it grows', () => {
    env.window['innerWidth'] = 1400;
    prefs.setState({ panelWidth: 700 });
    const layout = renderHook(usePanelLayout);
    expect(layout.current.width).toBe(700);
    resize(1100); // 60% of the window is the most the panel may take
    expect(layout.current.width).toBe(660);
    resize(1400);
    expect(layout.current.width).toBe(700);
  });

  it('stores a chosen width, but nothing at all for the default one', () => {
    env.window['innerWidth'] = 1400;
    const layout = renderHook(usePanelLayout);
    layout.current.setWidth(500);
    expect(prefs.getState().panelWidth).toBe(500);
    layout.current.setWidth(380);
    expect(prefs.getState().panelWidth).toBeNull();
  });

  it('collapses to the rail only where it can be resized, and not while it lies over a narrow window', () => {
    env.window['innerWidth'] = 1400;
    const layout = renderHook(usePanelLayout);
    layout.current.setCollapsed(true);
    expect(prefs.getState().panelCollapsed).toBe(true);
    layout.rerender();
    expect(layout.current).toMatchObject({ collapsed: true, occupied: 48 });
    resize(900);
    expect(layout.current).toMatchObject({ resizable: false, collapsed: false });
  });
});

describe('useScrollSpy', () => {
  type Callback = (entries: { target: { id: string }; isIntersecting: boolean }[]) => void;
  let callback: Callback;
  let observed: string[];
  let disconnected: boolean;
  let existing: Set<string>;
  beforeEach(() => {
    observed = [];
    disconnected = false;
    existing = new Set(['s-one', 's-two', 's-three']);
    installGlobal(
      'IntersectionObserver',
      class {
        constructor(cb: Callback) {
          callback = cb;
        }
        observe(element: { id: string }) {
          observed.push(element.id);
        }
        disconnect() {
          disconnected = true;
        }
      },
    );
    Object.assign(env.document, {
      getElementById: (id: string) => (existing.has(id) ? { id } : null),
      querySelector: () => null,
    });
  });
  const seen = (...ids: [string, boolean][]) =>
    callback(ids.map(([id, isIntersecting]) => ({ target: { id: `s-${id}` }, isIntersecting })));

  it('names the last section that has reached the upper part of the page', () => {
    const spy = renderHook(useScrollSpy, ['one', 'two', 'three'], true);
    expect(spy.current).toBeNull();
    seen(['one', true]);
    expect(spy.current).toBe('one');
    seen(['two', true]);
    expect(spy.current).toBe('two');
    seen(['two', false]); // scrolled back up: the earlier one is the last still in view
    expect(spy.current).toBe('one');
  });

  it('observes only the sections that exist, and nothing while disabled', () => {
    existing.delete('s-two');
    renderHook(useScrollSpy, ['one', 'two', 'three'], true);
    expect(observed).toEqual(['s-one', 's-three']);
    observed.length = 0;
    renderHook(useScrollSpy, ['one'], false);
    expect(observed).toEqual([]);
  });

  it('starts over when the list of sections changes, and lets go on unmount', () => {
    const spy = renderHook(useScrollSpy, ['one', 'two'], true);
    spy.rerender(['one', 'two'], true);
    expect(observed).toHaveLength(2); // same content: no new observer
    spy.rerender(['one', 'two', 'three'], true);
    expect(disconnected).toBe(true);
    expect(observed).toHaveLength(5);
    disconnected = false;
    spy.unmount();
    expect(disconnected).toBe(true);
  });
});

describe('useConvKeys', () => {
  type Turn = { focused: number; scrolled: number; contains: boolean; bottom: number };
  let turns: Turn[];
  let root: { current: unknown };
  let calls: string[];
  const element = (turn: Turn, index: number) => ({
    contains: () => turn.contains,
    getBoundingClientRect: () => ({ bottom: turn.bottom, top: 0 }),
    focus: () => (turn.focused += 1) && calls.push(`focus:${index}`),
    scrollIntoView: () => (turn.scrolled += 1) && calls.push(`scroll:${index}`),
  });
  const press = (handler: (e: never) => void, key: string, over: Record<string, unknown> = {}) => {
    const event = {
      key,
      timeStamp: 1000,
      metaKey: false,
      ctrlKey: false,
      altKey: false,
      target: { closest: () => null },
      preventDefault: () => calls.push('prevented'),
      ...over,
    };
    handler(event as never);
  };
  beforeEach(() => {
    calls = [];
    turns = [0, 1, 2].map((i) => ({
      focused: 0,
      scrolled: 0,
      contains: false,
      bottom: 100 * (i + 1),
    }));
    root = {
      current: {
        querySelectorAll: () => turns.map(element),
        getBoundingClientRect: () => ({ top: 150 }),
        scrollTo: () => calls.push('scrollTo'),
      },
    };
    installGlobal('document', { activeElement: null });
  });
  const mount = (still = true) =>
    renderHook(
      useConvKeys,
      root as never,
      () => calls.push('toBottom'),
      () => calls.push('stopGliding'),
      still,
    ).current;

  it('moves between turns with j and k, starting from the first turn still on screen', () => {
    const handler = mount();
    press(handler, 'j');
    expect(calls).toEqual(['prevented', 'stopGliding', 'focus:2', 'scroll:2']); // turn 1 ends below 150: current is 1
    calls.length = 0;
    press(handler, 'k');
    expect(calls).toContain('focus:0');
  });

  it('starts from the turn that holds focus, and stays inside the list', () => {
    turns[2]!.contains = true;
    const handler = mount();
    press(handler, 'j');
    expect(turns[2]!.focused).toBe(1); // already on the last turn
    press(handler, 'k');
    expect(turns[1]!.focused).toBe(1);
  });

  it('goes to the top on g g and to the bottom on G, which does not stop a glide', () => {
    const handler = mount();
    press(handler, 'g');
    expect(calls).toEqual([]);
    press(handler, 'g', { timeStamp: 1500 });
    expect(calls).toEqual(['prevented', 'stopGliding', 'focus:0', 'scrollTo']);
    calls.length = 0;
    press(handler, 'G');
    expect(calls).toEqual(['prevented', 'toBottom', 'focus:2']);
  });

  it('leaves keys to a field being typed in, to modified keys and to an empty conversation', () => {
    const handler = mount();
    press(handler, 'j', { target: { closest: () => ({}) } });
    press(handler, 'j', { metaKey: true });
    turns.length = 0;
    press(handler, 'j');
    expect(calls).toEqual(['prevented', 'stopGliding']); // taken, but with no turn there is nowhere to go
    root.current = null;
    calls.length = 0;
    press(handler, 'j');
    expect(calls).toEqual([]);
  });
});

describe('useConvScroll', () => {
  const entry = (text: string, role: Entry['role'] = 'assistant') =>
    ({ at: 1, role, name: null, text, error: false, toolId: null, summary: null }) as Entry;
  const box = (over: Record<string, number> = {}) => {
    const el = { scrollHeight: 1000, scrollTop: 0, clientHeight: 400, scrollTo: vi.fn(), ...over };
    return el;
  };

  it('lands at the bottom at once on the first look, then glides to new messages', () => {
    const view = renderHook(useConvScroll, [entry('a')] as Entry[] | undefined, false);
    const el = box({ scrollTop: 600 });
    view.current.scroller.current = el as never;
    view.rerender([entry('a')], false);
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'auto' });
    el.scrollTop = 0; // far from the bottom, but following
    view.rerender([entry('a'), entry('b')], false);
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'smooth' });
  });

  it('does not glide for a reader who asked for stillness', () => {
    const view = renderHook(useConvScroll, [entry('a')] as Entry[] | undefined, true);
    const el = box();
    view.current.scroller.current = el as never;
    view.rerender([entry('a')], true);
    view.rerender([entry('a'), entry('b')], true);
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'auto' });
  });

  it('stays put when scrolled up and counts the messages that arrive out of sight', () => {
    const view = renderHook(useConvScroll, [entry('a')] as Entry[] | undefined, true);
    const el = box({ scrollTop: 0 });
    view.current.scroller.current = el as never;
    view.rerender([entry('a')], true);
    view.current.onScroll(); // the reader scrolled up: 600px from the bottom
    expect(view.current.away).toBe(true);
    el.scrollTo.mockClear();
    view.rerender([entry('a'), entry('b'), entry('t', 'tool'), entry('c', 'user')], true);
    expect(el.scrollTo).not.toHaveBeenCalled();
    expect(view.current.unseen).toBe(2); // tool traffic is not a message
  });

  it('jumps to the latest on request and forgets the unseen count', () => {
    const view = renderHook(useConvScroll, [entry('a')] as Entry[] | undefined, true);
    const el = box();
    view.current.scroller.current = el as never;
    view.rerender([entry('a')], true);
    view.current.onScroll();
    view.rerender([entry('a'), entry('b')], true);
    expect(view.current.unseen).toBe(1);
    view.current.toBottom();
    expect(view.current).toMatchObject({ unseen: 0, away: false });
    expect(el.scrollTo).toHaveBeenLastCalledWith({ top: 1000, behavior: 'auto' });
  });

  it('keeps following once the reader is back near the bottom', () => {
    const view = renderHook(useConvScroll, [entry('a')] as Entry[] | undefined, true);
    const el = box();
    view.current.scroller.current = el as never;
    view.rerender([entry('a')], true);
    view.current.onScroll(); // away
    el.scrollTop = 580; // within 48px of the bottom again
    view.current.onScroll();
    expect(view.current.away).toBe(false);
    el.scrollTo.mockClear();
    view.rerender([entry('a'), entry('b')], true);
    expect(el.scrollTo).toHaveBeenCalled();
  });
});
