import { CanvasTexture, SRGBColorSpace } from 'three';
import type { DepartmentId } from '@aether/kernel';
import type { DeskProfile } from './desk-profile.js';
import {
  ambient,
  BAND,
  drawFooter,
  drawScanlines,
  drawTitleBar,
  viewTitle,
} from './screen-chrome.js';
import { chooseView, currentWork, type ViewId } from './screen-layout.js';
import { borrowCanvas, returnCanvas } from './screen-pool.js';
import { BAR_H, FOOTER_Y, PALETTES, SCREEN_H, SCREEN_W, type ViewCtx } from './screen-theme.js';
import { VIEWS } from './screen-views.js';
import { drawApproval, drawToast } from './screen-view-overlay.js';
import type { ToolCall } from './screen-work.js';
import { context2d } from './canvas-2d.js';

export { BAND };

/**
 * What a member's own screen is told when the scene knows what the member is really doing: the session's title, where
 * it works, its state, its last tool calls, the tool it is in, the context it has used. Every field is a fact read from
 * the session; a field that is not known is left out, never filled in. What the screen draws around these facts is
 * made up (see docs/design-system.md, "Desk screens").
 */
export type ScreenFacts = {
  provider: 'claude' | 'codex';
  title: string | null;
  repo: string;
  branch: string | null;
  /** Commits ahead of and behind upstream, and files not committed. */
  ahead: number;
  behind: number;
  uncommitted: number;
  model: string | null;
  /** Share of the context window in use, 0 to 100. */
  contextPercent: number | null;
  state: 'working' | 'idle' | 'waiting_permission' | 'offline' | 'unknown';
  /** The tool its last hook named, and when that hook came (epoch ms). */
  tool: string | null;
  toolSince: number | null;
  /** The last tool calls, oldest first. */
  recent: readonly ToolCall[];
  /** Whole minutes since anything happened in it. */
  quietMinutes: number | null;
  ports: readonly number[];
};

const NO_FACTS: ScreenFacts = {
  provider: 'claude',
  title: null,
  repo: '',
  branch: null,
  ahead: 0,
  behind: 0,
  uncommitted: 0,
  model: null,
  contextPercent: null,
  state: 'unknown',
  tool: null,
  toolSince: null,
  recent: [],
  quietMinutes: null,
  ports: [],
};

/** How a screen is painted: the pace the scene wants for it (nearer ones are painted more often) and the member's speed. */
export type PaintOptions = {
  /** Least ms between two paints of unchanged facts; Infinity paints only when the facts change. */
  interval: number;
  /** False under reduced motion: still frames, no typing or scrolling. */
  moving: boolean;
  /** How much faster than its own pace the member types, 1 to 2. */
  speed: number;
};

/** Two paints are never closer than this, however often the facts are replaced. */
const MIN_GAP_MS = 100;
const TRANSITION_MS = 360;
const SLIDE_PX = 90;
/** Slower than this a transition would show one stale frame, so it is skipped. */
const FAST_MS = 300;

const MAIN_BOX = { x: 0, y: BAR_H + 1, w: SCREEN_W * BAND.from, h: FOOTER_Y - BAR_H - 1 };
const LOCK_BOX = { x: 0, y: BAR_H + 1, w: SCREEN_W, h: SCREEN_H - BAR_H - 1 };

/**
 * One member's screen: a canvas painted at the pace the scene asks, from the facts, the member's role and its desk
 * profile. Which view it shows follows the real work (screen-layout.ts); a change of view slides over a copy of the
 * old one. Call `paint` every frame, it does nothing until a paint is due. Dispose when the member leaves.
 */
export function createFactsScreen(
  accent: string,
  department: DepartmentId,
  seed: string,
  role: string,
  profile: DeskProfile,
) {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const g = context2d(canvas);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const p = PALETTES[profile.theme];
  const ctx: ViewCtx = {
    g,
    box: MAIN_BOX,
    p,
    accent,
    seed,
    now: 0,
    elapsed: 0,
    work: currentWork({ state: 'unknown', tool: null, recent: [] }),
    facts: NO_FACTS, // replaced by the first paint, before any view reads it
    role,
    profile,
    speed: 1,
    dt: 0,
    state: { scroll: 0, secondScroll: 0 },
    moving: true,
  };
  let view: ViewId | null = null;
  let drawnFacts: ScreenFacts | null = null;
  let lastAt = 0;
  let ghost: HTMLCanvasElement | null = null;
  let ghostAt = 0;

  return {
    texture,
    paint(facts: ScreenFacts, now: number, options: PaintOptions) {
      if (drawnFacts && now - lastAt < MIN_GAP_MS) return; // new facts never repaint faster than this
      if (facts === drawnFacts && now - lastAt < options.interval) return;
      ctx.work = currentWork(facts);
      const next = chooseView(role, ctx.work, facts.state, seed, now);
      if (next !== view) {
        if (view !== null && options.moving && options.interval <= FAST_MS) {
          ghost ??= borrowCanvas(SCREEN_W, SCREEN_H);
          context2d(ghost).drawImage(canvas, 0, 0);
          ghostAt = now - TRANSITION_MS / 3; // the slide is already under way on its first frame
        }
        ctx.state.scroll = 0;
        view = next;
      }
      ctx.facts = facts;
      ctx.now = now;
      ctx.elapsed = facts.tool && facts.toolSince !== null ? Math.max(0, now - facts.toolSince) : 0;
      ctx.dt = drawnFacts ? Math.min(now - lastAt, 1000) : 0;
      ctx.speed = options.speed;
      ctx.moving = options.moving;

      g.fillStyle = p.bg;
      g.fillRect(0, 0, SCREEN_W, SCREEN_H);
      ctx.box = view === 'lock' ? LOCK_BOX : MAIN_BOX;
      VIEWS[view](ctx);
      if (view !== 'lock') {
        if (view !== 'editor') ambient(g, department, accent);
        drawFooter(ctx);
      }
      drawTitleBar(ctx, viewTitle(view, ctx), department);
      if (facts.state === 'waiting_permission') drawApproval(ctx);
      else if (options.moving && view !== 'lock') drawToast(ctx);
      if (ghost) {
        const k = (now - ghostAt) / TRANSITION_MS;
        if (k < 1) {
          g.globalAlpha = 1 - k;
          g.drawImage(ghost, -k * SLIDE_PX, 0);
          g.globalAlpha = 1;
        } else {
          returnCanvas(ghost);
          ghost = null;
        }
      }
      drawScanlines(g);
      texture.needsUpdate = true;
      drawnFacts = facts;
      lastAt = now;
    },
    dispose() {
      if (ghost) returnCanvas(ghost);
      texture.dispose();
    },
  };
}
