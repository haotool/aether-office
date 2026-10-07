import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installBrowserEnv,
  installGlobal,
  removeBrowserEnv,
  type BrowserEnv,
} from './fixtures/browser-env.js';

// state.ts reads window.matchMedia and navigator when it is imported, so each case installs the browser it wants first
// and imports the module afresh.
const KEY = 'aether-ui-preferences';
const REDUCED = '(prefers-reduced-motion: reduce)';
const NARROW = '(max-width: 760px)';

let env: BrowserEnv;
async function load(
  options: { media?: string[]; language?: string; webdriver?: boolean; saved?: unknown } = {},
) {
  vi.resetModules();
  env = installBrowserEnv(options.media ?? []);
  if (options.saved !== undefined)
    env.storage.setItem(
      KEY,
      typeof options.saved === 'string' ? options.saved : JSON.stringify(options.saved),
    );
  installGlobal('navigator', {
    language: options.language ?? 'en-US',
    webdriver: options.webdriver ?? false,
    onLine: true,
  });
  return (await import('../../apps/web/src/state.js')).usePreferences;
}
const stored = () =>
  JSON.parse(env.storage.getItem(KEY)!) as { state: Record<string, unknown>; version: number };

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  removeBrowserEnv();
});

describe('stored preferences', () => {
  it('start from sensible defaults and remember the detected language on a first visit', async () => {
    const store = await load({ language: 'zh-TW' });
    const state = store.getState();
    expect(state).toMatchObject({
      locale: 'zh-TW',
      theme: 'dark',
      view: '3d',
      notify: true,
      advanced: false,
      autoCamera: true,
      panelWidth: null,
      panelCollapsed: false,
      beanstalk: true,
    });
    expect(stored().state['locale']).toBe('zh-TW');
    expect(stored().version).toBe(1);
  });

  it('turn the decorative extras down for reduced motion and a narrow screen', async () => {
    const state = (await load({ media: [REDUCED, NARROW] })).getState();
    expect(state.reducedMotion).toBe(true);
    expect(state.life.calm).toBe(true);
    expect(state.beanstalk).toBe(false);
  });

  it('keep the camera still under browser automation, so a test can tap a target that holds still', async () => {
    expect((await load({ webdriver: true })).getState().autoCamera).toBe(false);
  });

  it('persist a change but never the setter, and keep a saved language over the browser one', async () => {
    const first = await load({ language: 'en-US' });
    first.getState().set({ locale: 'zh-TW', panelWidth: 420, theme: 'system' });
    const written = env.storage.getItem(KEY)!;
    expect(Object.keys(stored().state)).not.toContain('set');
    expect(stored().state).toMatchObject({ locale: 'zh-TW', panelWidth: 420, theme: 'system' });
    const again = (await load({ saved: written })).getState();
    expect(again).toMatchObject({ locale: 'zh-TW', panelWidth: 420, theme: 'system' });
  });

  it('repair a hand-edited or half-written life section on load', async () => {
    const state = (
      await load({
        saved: {
          version: 1,
          state: { locale: 'en', life: { calm: 'yes', frequency: 'constantly', categories: 5 } },
        },
      })
    ).getState();
    expect(typeof state.life.calm).toBe('boolean');
    expect(['normal', 'rare']).toContain(state.life.frequency);
    expect(Object.values(state.life.categories).every((on) => typeof on === 'boolean')).toBe(true);
  });

  it('migrate preferences saved before the life settings existed', async () => {
    const state = (
      await load({
        saved: { version: 0, state: { locale: 'en', reducedMotion: true, theme: 'light' } },
      })
    ).getState();
    expect(state.theme).toBe('light');
    expect(state.life.calm).toBe(true); // reduced motion already asked for stillness
  });

  it('start over from the defaults when storage holds something unreadable', async () => {
    const state = (await load({ saved: '{not json' })).getState();
    expect(state.locale).toBe('en');
    expect(state.view).toBe('3d');
  });
});
