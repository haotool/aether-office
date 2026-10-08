import { afterAll, beforeEach } from 'vitest';
import type { DeskProfile } from '../../packages/office-scene/src/desks/desk-profile.js';
import { currentWork, type ViewId } from '../../packages/office-scene/src/screen/screen-layout.js';
import type { ScreenFacts } from '../../packages/office-scene/src/screen/screen-facts.js';
import {
  FOOTER_Y,
  PALETTES,
  SCREEN_W,
  type ViewCtx,
} from '../../packages/office-scene/src/screen/screen-theme.js';
import { VIEWS } from '../../packages/office-scene/src/screen/screen-views.js';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import { recordingContext } from './fixtures/recording-canvas.js';

export const NOW = 1_700_000_000_000;
export const BOX = { x: 0, y: 31, w: SCREEN_W * 0.89, h: FOOTER_Y - 31 };
export const ALL_VIEWS = Object.keys(VIEWS) as ViewId[];

export const facts = (over: Partial<ScreenFacts> = {}): ScreenFacts => ({
  provider: 'claude',
  title: 'Fix the login bug',
  repo: 'aether',
  branch: 'feat/login',
  ahead: 2,
  behind: 0,
  uncommitted: 3,
  model: 'opus',
  contextPercent: 42,
  state: 'working',
  tool: 'Bash',
  toolSince: NOW - 4_000,
  recent: [
    { tool: 'Edit', target: 'src/login.ts' },
    { tool: 'Edit', target: 'src/login.ts' },
    { tool: 'Edit', target: 'src/session.test.ts' },
    { tool: 'Bash', target: 'pnpm test' },
  ],
  quietMinutes: 0,
  ports: [3000, 5173],
  ...over,
});

export const profile = (over: Partial<DeskProfile> = {}): DeskProfile => ({
  theme: 'dark',
  chrome: 'mac',
  monitors: 1,
  secondary: null,
  side: 'right',
  items: [],
  sticky: 0,
  wallpaper: 0,
  ...over,
});

export function context(over: Partial<ViewCtx> & { facts?: ScreenFacts } = {}) {
  const { g, calls } = recordingContext();
  const f = over.facts ?? facts();
  const ctx: ViewCtx = {
    g,
    box: BOX,
    p: PALETTES.dark,
    accent: '#43e6df',
    seed: 'member-1',
    now: NOW,
    elapsed: 4_000,
    work: currentWork(f),
    facts: f,
    role: 'frontend',
    profile: profile(),
    speed: 1,
    dt: 16,
    state: { scroll: 0, secondScroll: 0 },
    moving: true,
    ...over,
  };
  return { ctx, calls };
}

export const paint = (view: ViewId, over: Parameters<typeof context>[0] = {}) => {
  const { ctx, calls } = context(over);
  VIEWS[view](ctx);
  return calls;
};

export function registerDeskScreenHooks() {
  installBrowserEnv();
  beforeEach(() => {
    installGlobal('Path2D', class {});
    installGlobal('document', {
      createElement: () => {
        const { g } = recordingContext();
        return { width: 0, height: 0, getContext: () => g };
      },
    });
  });
  afterAll(removeBrowserEnv);
}
