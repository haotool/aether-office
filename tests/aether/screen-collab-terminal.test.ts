import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { DeskProfile } from '../../packages/office-scene/src/desks/desk-profile.js';
import type { ScreenFacts } from '../../packages/office-scene/src/screen/screen-facts.js';
import { currentWork } from '../../packages/office-scene/src/screen/screen-layout.js';
import { PALETTES, type ViewCtx } from '../../packages/office-scene/src/screen/screen-theme.js';
import { drawChat } from '../../packages/office-scene/src/screen/screen-view-collab.js';
import { drawTerminal } from '../../packages/office-scene/src/screen/screen-view-terminal.js';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import { numbersOf, recordingContext } from './fixtures/recording-canvas.js';

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

const NOW = 1_700_000_000_000;
const facts = (): ScreenFacts => ({
  provider: 'claude',
  title: 'Fix',
  repo: 'aether',
  branch: 'main',
  ahead: 0,
  behind: 0,
  uncommitted: 0,
  model: 'opus',
  contextPercent: 10,
  state: 'working',
  tool: 'Bash',
  toolSince: NOW - 1000,
  recent: [
    { tool: 'Task', target: 'sub' },
    { tool: 'Bash', target: 'pnpm test' },
  ],
  quietMinutes: 0,
  ports: [3000],
});

const profile = (): DeskProfile => ({
  theme: 'dark',
  chrome: 'mac',
  monitors: 1,
  secondary: null,
  side: 'right',
  items: [],
  sticky: 0,
  wallpaper: 0,
});

const viewCtx = (): ViewCtx => {
  const { g } = recordingContext();
  const f = facts();
  return {
    g,
    box: { x: 0, y: 31, w: 640, h: 330 },
    p: PALETTES.dark,
    accent: '#43e6df',
    seed: 'member-1',
    now: NOW,
    elapsed: 4000,
    work: currentWork(f),
    facts: f,
    role: 'frontend',
    profile: profile(),
    speed: 1,
    dt: 16,
    state: { scroll: 0, secondScroll: 0 },
    moving: true,
  };
};

describe('collab and terminal desk views', () => {
  it('drawChat paints without invalid coordinates', () => {
    const { g, calls } = recordingContext();
    drawChat({ ...viewCtx(), g });
    expect(numbersOf(calls).every(Number.isFinite)).toBe(true);
  });

  it('drawTerminal paints without invalid coordinates', () => {
    const { g, calls } = recordingContext();
    drawTerminal({ ...viewCtx(), g });
    expect(numbersOf(calls).every(Number.isFinite)).toBe(true);
  });
});
