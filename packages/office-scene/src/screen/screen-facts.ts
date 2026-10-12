import { CanvasTexture, SRGBColorSpace } from 'three';
import type { DepartmentId } from '@aether/kernel';
import type { DeskProfile } from '../desks/desk-profile.js';
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
import { context2d } from '../core/canvas-2d.js';

export { BAND };

/**
 * Every field is a fact read from the session; a field that is not known is left out, never filled in. What the screen
 * draws around the facts is made up (see docs/design-system.md, "Desk screens").
 */
export type ScreenFacts = {
  provider: 'claude' | 'codex';
  title: string | null;
  repo: string;
  branch: string | null;
  ahead: number;
  behind: number;
  uncommitted: number;
  model: string | null;
  contextPercent: number | null;
  state: 'working' | 'idle' | 'waiting_permission' | 'offline' | 'unknown';
  tool: string | null;
  toolSince: number | null;
  recent: readonly ToolCall[];
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

export type PaintOptions = {
  interval: number;
  moving: boolean;
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

function newScreenCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return { canvas, g: context2d(canvas), texture };
}

function readFacts(
  ctx: ViewCtx,
  facts: ScreenFacts,
  now: number,
  dt: number,
  options: PaintOptions,
) {
  ctx.facts = facts;
  ctx.now = now;
  ctx.elapsed = facts.tool && facts.toolSince !== null ? Math.max(0, now - facts.toolSince) : 0;
  ctx.dt = dt;
  ctx.speed = options.speed;
  ctx.moving = options.moving;
}

function newViewCtx(
  g: CanvasRenderingContext2D,
  p: ViewCtx['p'],
  accent: string,
  seed: string,
  role: string,
  profile: DeskProfile,
): ViewCtx {
  return {
    g,
    box: MAIN_BOX,
    p,
    accent,
    seed,
    now: 0,
    elapsed: 0,
    work: currentWork({ state: 'unknown', tool: null, recent: [] }),
    facts: NO_FACTS,
    role,
    profile,
    speed: 1,
    dt: 0,
    state: { scroll: 0, secondScroll: 0 },
    moving: true,
  };
}

function drawView(ctx: ViewCtx, view: ViewId, department: DepartmentId): void {
  const { g, p, accent } = ctx;
  g.fillStyle = p.bg;
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  ctx.box = view === 'lock' ? LOCK_BOX : MAIN_BOX;
  VIEWS[view](ctx);
  if (view !== 'lock') {
    if (view !== 'editor') ambient(g, department, accent);
    drawFooter(ctx);
  }
  drawTitleBar(ctx, viewTitle(view, ctx), department);
  if (ctx.facts.state === 'waiting_permission') drawApproval(ctx);
  else if (ctx.moving && view !== 'lock') drawToast(ctx);
}

function drawGhost(
  g: CanvasRenderingContext2D,
  ghost: HTMLCanvasElement,
  now: number,
  since: number,
) {
  const k = (now - since) / TRANSITION_MS;
  if (k >= 1) return false;
  g.globalAlpha = 1 - k;
  g.drawImage(ghost, -k * SLIDE_PX, 0);
  g.globalAlpha = 1;
  return true;
}

export function createFactsScreen(
  accent: string,
  department: DepartmentId,
  seed: string,
  role: string,
  profile: DeskProfile,
) {
  const { canvas, g, texture } = newScreenCanvas();
  const ctx = newViewCtx(g, PALETTES[profile.theme], accent, seed, role, profile);
  let view: ViewId | null = null;
  let drawnFacts: ScreenFacts | null = null;
  let lastAt = 0;
  let ghost: HTMLCanvasElement | null = null;
  let ghostAt = 0;

  return {
    texture,
    paint(facts: ScreenFacts, now: number, options: PaintOptions) {
      if (drawnFacts && now - lastAt < MIN_GAP_MS) return;
      if (facts === drawnFacts && now - lastAt < options.interval) return;
      ctx.work = currentWork(facts);
      const next = chooseView(role, ctx.work, facts.state, seed, now);
      if (next !== view) {
        if (view !== null && options.moving && options.interval <= FAST_MS) {
          ghost ??= borrowCanvas(SCREEN_W, SCREEN_H);
          context2d(ghost).drawImage(canvas, 0, 0);
          ghostAt = now - TRANSITION_MS / 3;
        }
        ctx.state.scroll = 0;
        view = next;
      }
      readFacts(ctx, facts, now, drawnFacts ? Math.min(now - lastAt, 1000) : 0, options);
      drawView(ctx, view, department);
      if (ghost && !drawGhost(g, ghost, now, ghostAt)) {
        returnCanvas(ghost);
        ghost = null;
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
