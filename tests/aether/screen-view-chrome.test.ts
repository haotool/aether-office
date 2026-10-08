import { describe, expect, it } from 'vitest';
import {
  ambient,
  drawFooter,
  drawScanlines,
  drawTitleBar,
  viewTitle,
} from '../../packages/office-scene/src/screen/screen-chrome.js';
import { SCREEN_W, type ViewCtx } from '../../packages/office-scene/src/screen/screen-theme.js';
import {
  drawApproval,
  drawLock,
  drawToast,
} from '../../packages/office-scene/src/screen/screen-view-overlay.js';
import {
  drawTerminal,
  termContext,
} from '../../packages/office-scene/src/screen/screen-view-terminal.js';
import { recordingContext, textsOf, type DrawCall } from './fixtures/recording-canvas.js';
import {
  BOX,
  context,
  facts,
  paint,
  profile,
  registerDeskScreenHooks,
} from './screen-view-desk-fixtures.js';

registerDeskScreenHooks();

describe('terminal view', () => {
  it('collects the files really edited, once each, with the ports and uncommitted files', () => {
    const { ctx } = context();
    expect(termContext(ctx)).toEqual({
      branch: 'feat/login',
      edited: ['src/login.ts', 'src/session.test.ts'],
      ports: [3000, 5173],
      uncommitted: 3,
    });
  });

  it('shows the command the member ran with the repository and branch at the prompt', () => {
    const { ctx, calls } = context();
    drawTerminal(ctx);
    const words = textsOf(calls);
    expect(words).toContain('$ pnpm test');
    expect(words.some((t) => t.includes('aether') && t.includes('feat/login'))).toBe(true);
  });

  it('spins while a command runs and rests at a dollar sign when it does not', () => {
    const running = textsOf(paint('terminal'));
    expect(running.some((t) => /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/.test(t))).toBe(true);
    const resting = textsOf(paint('terminal', { facts: facts({ tool: null, toolSince: null }) }));
    expect(resting).toContain('$');
    expect(resting.some((t) => /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/.test(t))).toBe(false);
  });

  it('shows only the last few commands, never more rows than fit the box', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ tool: 'Bash', target: `cmd-${i}` }));
    const words = textsOf(paint('terminal', { facts: facts({ recent: many }) }));
    expect(words).toContain('$ cmd-29');
    expect(words).not.toContain('$ cmd-0');
    expect(words.length).toBeLessThanOrEqual(Math.floor((BOX.h - 20) / 14) + 2);
  });
});

describe('window chrome', () => {
  it('titles each view with the real file, command or repository', () => {
    const { ctx } = context({
      facts: facts({ recent: [{ tool: 'Edit', target: 'src/login.ts' }], tool: 'Edit' }),
    });
    expect(viewTitle('editor', ctx)).toBe('src/login.ts — aether');
    expect(viewTitle('git-graph', ctx)).toBe('aether · git');
    expect(viewTitle('lock', ctx)).toBe('aether');
    expect(viewTitle('chat', ctx)).toBe('agents');
    expect(viewTitle('dashboard', ctx)).toBe('overview');
    expect(viewTitle('design', ctx)).toBe('canvas');
    const bare = context({ facts: facts({ recent: [], tool: null }) }).ctx;
    expect(viewTitle('editor', bare)).toBe('untitled — aether');
    expect(viewTitle('terminal', bare)).toBe('aether — zsh');
    expect(viewTitle('browser', bare)).toBe('new tab');
  });

  it('draws a title bar centred for a Mac window and at the left for the others, with the department', () => {
    const mac = context();
    drawTitleBar(mac.ctx, 'a title', 'quality');
    expect(mac.calls).toContainEqual({ op: 'set textAlign', args: ['center'] });
    expect(textsOf(mac.calls)).toEqual(['a title', 'CHECKS']);
    const win = context({ profile: profile({ chrome: 'win' }) });
    drawTitleBar(win.ctx, 'a title', 'data');
    expect(win.calls).not.toContainEqual({ op: 'set textAlign', args: ['center'] });
    expect(textsOf(win.calls)).toContain('ANALYSIS');
  });

  it('writes the footer from real facts: the tool and its clock, quiet time, ports, context', () => {
    const { ctx, calls } = context();
    drawFooter(ctx);
    const line = textsOf(calls)[0]!;
    expect(line).toContain('▶ Bash');
    expect(line).toContain('4s');
    expect(line).toContain('active now');
    expect(line).toContain(':3000');
    expect(textsOf(calls)).toContain('42% opus');
  });

  it('says what is not running instead of inventing it', () => {
    const idle = context({
      facts: facts({
        state: 'idle',
        tool: null,
        toolSince: null,
        quietMinutes: 12,
        ports: [],
        contextPercent: null,
      }),
    });
    drawFooter(idle.ctx);
    expect(textsOf(idle.calls)).toEqual(['quiet 12m']);
    const asking = context({ facts: facts({ state: 'waiting_permission' }) });
    drawFooter(asking.ctx);
    expect(textsOf(asking.calls)[0]).toContain('⚠ approval needed');
    const thinking = context({ facts: facts({ tool: null, toolSince: null }) });
    drawFooter(thinking.ctx);
    expect(textsOf(thinking.calls)[0]).toContain('thinking');
  });

  it('keeps the context bar inside its track', () => {
    for (const contextPercent of [-20, 0, 55, 100, 250]) {
      const { ctx, calls } = context({ facts: facts({ contextPercent }) });
      drawFooter(ctx);
      const fills = calls.filter((c) => c.op === 'fillRect').map((c) => c.args as number[]);
      const bar = fills.find((a) => a[1] === 375);
      expect(bar![2], String(contextPercent)).toBeGreaterThanOrEqual(0);
      expect(bar![2]).toBeLessThanOrEqual(SCREEN_W - 32);
    }
  });

  it('dresses each department’s column with a pattern of its own, inside the column', () => {
    const patterns = (['product', 'platform', 'quality', 'data', 'leadership'] as const).map(
      (dept) => {
        const { g, calls } = recordingContext();
        ambient(g, dept, '#fff');
        for (const [x] of calls
          .filter((c) => c.op === 'fillRect' || c.op === 'strokeRect')
          .map((c) => c.args as number[]))
          expect(x).toBeGreaterThanOrEqual(SCREEN_W * 0.89);
        return JSON.stringify(calls);
      },
    );
    expect(new Set(patterns).size).toBe(5);
  });

  it('lays scanlines over the screen from one cached canvas', () => {
    const first = recordingContext();
    drawScanlines(first.g);
    const second = recordingContext();
    drawScanlines(second.g);
    expect(first.calls).toHaveLength(1);
    expect(first.calls[0]!.op).toBe('drawImage');
    expect(second.calls[0]!.args[0]).toBe(first.calls[0]!.args[0]);
  });
});

describe('overlays', () => {
  const draw = (fn: (c: ViewCtx) => void, over: Parameters<typeof context>[0] = {}) => {
    const { ctx, calls } = context(over);
    fn(ctx);
    return calls;
  };

  it('asks for approval in the session’s own words: the tool and its target', () => {
    const calls = draw(drawApproval, {
      facts: facts({ state: 'waiting_permission', tool: 'Bash' }),
    });
    const words = textsOf(calls);
    expect(words).toContain('Allow Bash?');
    expect(words).toContain('Allow');
    expect(words).toContain('Deny');
    expect(words).toContain('pnpm test');
  });

  it('pulses its Allow button only while moving, and falls back to a generic question without a tool', () => {
    const alpha = (calls: DrawCall[]) =>
      calls.filter((c) => c.op === 'set globalAlpha').map((c) => c.args[0] as number);
    expect(alpha(draw(drawApproval)).some((a) => a < 1 && a > 0.4)).toBe(true);
    expect(alpha(draw(drawApproval, { moving: false })).every((a) => a === 1 || a === 0.45)).toBe(
      true,
    );
    const bare = draw(drawApproval, { facts: facts({ tool: null, recent: [] }) });
    expect(textsOf(bare)).toContain('Allow this tool?');
  });

  it('shows a toast now and then, at the same moment for the same member, and never any words in it', () => {
    let shown = 0;
    for (let bucket = 0; bucket < 60; bucket++)
      for (const offset of [5_000, 20_000, 40_000]) {
        const at = bucket * 55_000 + offset;
        const calls = draw(drawToast, { now: at });
        expect(calls).toEqual(draw(drawToast, { now: at }));
        expect(textsOf(calls)).toEqual([]);
        if (calls.length) shown++;
      }
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(180);
  });

  it('locks a screen that is not working with its real state words', () => {
    const idle = textsOf(draw(drawLock, { facts: facts({ state: 'idle', tool: null }) }));
    expect(idle).toContain('IDLE · quiet 0m');
    expect(idle).toContain('Fix the login bug');
    expect(idle).toContain('context 42%');
    expect(textsOf(draw(drawLock, { facts: facts({ state: 'offline', tool: null }) }))).toContain(
      'ENDED',
    );
  });

  it('draws each of three wallpapers differently', () => {
    const wallpapers = ([0, 1, 2] as const).map((wallpaper) =>
      JSON.stringify(
        draw(drawLock, {
          profile: profile({ wallpaper }),
          facts: facts({ state: 'idle', tool: null }),
        }),
      ),
    );
    expect(new Set(wallpapers).size).toBe(3);
  });
});
