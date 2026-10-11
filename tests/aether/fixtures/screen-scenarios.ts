import type { DeskProfile } from '../../../packages/office-scene/src/desks/desk-profile.js';
import {
  LIFE_CATEGORIES,
  type LifeContext,
  type LifePrefs,
  type LifeSignal,
  type SignalKind,
} from '../../../packages/office-scene/src/life/signals.js';
import { recordingContext } from './recording-canvas.js';
import type { SceneModules } from './scene-scenarios.js';

export function screens(m: SceneModules) {
  const r = m.seeded('screens');
  const now = 1_700_000_000_000;
  const tools = ['Bash', 'Edit', 'Read', 'WebFetch', 'WebSearch', 'Task', 'Grep', 'Write', null];
  const targets = [
    'src/a.ts',
    'https://example.com/docs',
    'pnpm test',
    'a b c',
    'README.md',
    'notes.md',
    null,
  ];
  const states = ['working', 'idle', 'waiting_permission', 'unknown'] as const;
  const out: unknown[] = [];
  for (let t = 0; t < 60; t++) {
    const tool = tools[Math.floor(r() * tools.length)] ?? null;
    const facts = {
      provider: 'claude' as const,
      title: r() < 0.2 ? null : 'Fix it',
      repo: 'aether',
      branch: r() < 0.2 ? null : 'feat/x',
      ahead: Math.floor(r() * 5),
      behind: Math.floor(r() * 3),
      uncommitted: Math.floor(r() * 6),
      model: 'opus',
      contextPercent: r() < 0.2 ? null : r() * 100,
      state: states[Math.floor(r() * 4)] ?? 'unknown',
      tool,
      toolSince: tool ? now - r() * 9000 : null,
      recent: Array.from({ length: Math.floor(r() * 6) }, () => ({
        tool: tools[Math.floor(r() * 8)] ?? 'Bash',
        target: targets[Math.floor(r() * targets.length)] ?? null,
      })),
      quietMinutes: r() < 0.3 ? null : Math.floor(r() * 30),
      ports: r() < 0.5 ? [] : [3000, 5173],
    };
    const theme = t % 2 ? 'dark' : 'light';
    const moving = r() < 0.7;
    const elapsed = Math.floor(r() * 9000);
    const profile: DeskProfile = {
      theme,
      chrome: 'mac',
      monitors: 1,
      secondary: null,
      side: 'right',
      items: [],
      sticky: 0,
      wallpaper: (t % 3) as DeskProfile['wallpaper'],
    };
    for (const draw of Object.values(m.views.VIEWS)) {
      const { g, calls } = recordingContext();
      const ctx = {
        g,
        box: { x: 0, y: 31, w: 640 * 0.89, h: 330 },
        p: m.theme.PALETTES[theme],
        accent: '#43e6df',
        seed: `m${t % 7}`,
        now: now + t * 1234,
        elapsed,
        work: m.screenLayout.currentWork(facts),
        facts,
        role: 'frontend',
        profile,
        speed: 1.25,
        dt: 16,
        state: { scroll: 40, secondScroll: 0 },
        moving,
      };
      draw(ctx);
      out.push([calls, ctx.state.scroll]);
    }
  }
  return out;
}

export function lifeSchedule(m: SceneModules) {
  const r = m.seeded('life');
  const ctx: LifeContext = {
    floorOf: (member) => Number(member.slice(1)) % 3,
    visible: () => true,
    idleOn: () => ['a1', 'a2'],
    nameOf: (member) => member,
    zh: false,
  };
  const prefs: LifePrefs = {
    calm: false,
    frequency: 'normal',
    relation: true,
    categories: Object.fromEntries(
      LIFE_CATEGORIES.map((c) => [c, true]),
    ) as LifePrefs['categories'],
  };
  const kinds: SignalKind[] = [
    'tool.start',
    'tool.end',
    'git.conflicts',
    'tests.machine',
    'tests.edited',
    'think.long',
    'work.long',
    'retry.loop',
    'debt.sustained',
    'idle.long',
    'activity.error',
    'ui.konami',
  ];
  let state = m.schedule.emptyLifeState;
  const out: unknown[] = [];
  for (let i = 0; i < 200; i++) {
    const signals = Array.from({ length: Math.floor(r() * 3) }, (): LifeSignal => {
      const kind = kinds[Math.floor(r() * kinds.length)] ?? 'tool.start';
      return {
        kind,
        member: kind === 'ui.konami' ? null : `a${Math.floor(r() * 5)}`,
        at: 1_000_000 + i * 1000 - Math.floor(r() * 4000),
        ok: r() < 0.5 ? r() < 0.5 : null,
        value: Math.floor(r() * 9),
      };
    });
    const run = m.schedule.schedule(state, signals, 1_000_000 + i * 1000, prefs, ctx, {
      quality: 'high',
      reducedMotion: false,
    });
    state = run.state;
    out.push(run);
  }
  return out;
}
