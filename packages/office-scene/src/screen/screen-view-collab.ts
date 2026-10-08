import type { Rng } from '../environment/seeded.js';
import { viewRng } from './screen-seed.js';
import { generateFile } from './screen-codegen.js';
import { polyline, roundRect, text, textBars, wander, fit } from './screen-ui.js';
import { MONO, SANS, type ViewCtx } from './screen-theme.js';

const AGENT_CALL = /^(Task|Agent|SendMessage|TaskCreate|TeamCreate|Delegate)/;

/** Agent coordination as a chat: the number of agents is the count of subagent calls really made; the messages are bubbles, not words. */
export function drawChat(c: ViewCtx): void {
  const { g, p, box } = c;
  const agents = c.facts.recent.filter((call) => AGENT_CALL.test(call.tool)).length;
  const r = viewRng(c, 'chat');
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  g.fillStyle = p.panel;
  g.fillRect(box.x, box.y, 130, box.h);
  text(g, `agents · ${agents}`, box.x + 10, box.y + 20, c.accent, 12, SANS, '600');
  for (let i = 0; i < Math.max(2, Math.min(agents, 6)); i++) {
    const y = box.y + 38 + i * 30;
    g.fillStyle = i === 0 ? p.bg : p.panel;
    g.fillRect(box.x + 4, y - 4, 122, 26);
    g.fillStyle = [c.accent, p.info, p.warn, p.add][i % 4] ?? c.accent;
    g.beginPath();
    g.arc(box.x + 18, y + 9, 7, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = p.dim;
    g.fillRect(box.x + 32, y + 6, 50 + r() * 30, 5);
  }
  const bubbles = c.moving ? Math.min(7, 3 + Math.floor(c.elapsed / 2600)) : 5;
  const x0 = box.x + 146;
  const w = box.w - 160;
  let y = box.y + box.h - 40;
  for (let i = bubbles - 1; i >= 0; i--) {
    const own = i % 2 === 0;
    const lines = 1 + Math.floor(r() * 3);
    const h = 14 + lines * 9;
    const bw = w * (0.35 + r() * 0.35);
    y -= h + 8;
    if (y < box.y + 6) break;
    const bx = own ? x0 + w - bw : x0;
    g.fillStyle = own ? c.accent : p.panel;
    g.globalAlpha = own ? 0.28 : 1;
    roundRect(g, bx, y, bw, h, 8);
    g.fill();
    g.globalAlpha = 1;
    textBars(g, r, bx + 10, y + 8, bw - 20, lines, own ? p.text : p.dim);
  }
  if (c.facts.tool) {
    const phase = Math.floor(c.now / 300) % 3; // someone is typing
    for (let i = 0; i < 3; i++) {
      g.fillStyle = i === phase ? p.text : p.dim;
      g.beginPath();
      g.arc(x0 + 10 + i * 10, box.y + box.h - 18, 3, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A notebook: code cells in the file's name over made-up Python, and the chart a cell would draw. */
export function drawNotebook(c: ViewCtx): void {
  const { g, p, box } = c;
  const file = c.work.file ?? 'analysis.py';
  const code = generateFile(c.seed, file, 'py', 40);
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  g.fillStyle = p.panel;
  g.fillRect(box.x, box.y, box.w, 22);
  text(g, fit(g, file, box.w - 20), box.x + 10, box.y + 15, p.text, 12);
  const shift = c.moving ? Math.floor(c.now / 500) : 0;
  [0, 1].forEach((cell) => {
    const y = box.y + 30 + cell * 152;
    g.fillStyle = p.panel;
    g.fillRect(box.x + 10, y, box.w - 20, 62);
    text(g, `In [${cell + 3}]`, box.x + 16, y + 14, p.dim, 10);
    for (let i = 0; i < 4; i++) {
      const line = code[cell * 8 + 4 + i];
      if (!line) continue;
      let at = box.x + 70;
      g.font = `11px ${MONO}`;
      for (const [kind, s] of line.tokens) {
        g.fillStyle = p.syntax[kind];
        g.fillText(s, at, y + 14 + i * 13);
        at += g.measureText(s).width;
      }
    }
    const out = y + 66;
    if (cell === 0)
      polyline(
        g,
        wander(viewRng(c, 'nb:a'), 40),
        box.x + 20,
        out + 8,
        box.w - 160,
        66,
        c.accent,
        shift,
      );
    else
      for (let i = 0; i < 14; i++) {
        const h = 10 + ((((i * 37 + shift * 11) % 50) + 50) % 50);
        g.fillStyle = i % 4 === 0 ? c.accent : p.info;
        g.globalAlpha = 0.7;
        g.fillRect(box.x + 24 + i * 24, out + 76 - h, 16, h);
        g.globalAlpha = 1;
      }
  });
}

const FRAMES = [
  { x: 150, y: 28, w: 110, h: 190 },
  { x: 280, y: 28, w: 110, h: 190 },
  { x: 150, y: 232, w: 240, h: 70 },
];
type Frame = (typeof FRAMES)[number];
/** The eight handles of a selection, as fractions of its width and height. */
const HANDLES = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
  [0.5, 0],
  [0.5, 1],
  [0, 0.5],
  [1, 0.5],
] as const;

/** The canvas with its dot grid, the layers list on the left and the side bar on the right. */
function drawDesignChrome(c: ViewCtx, r: Rng): void {
  const { g, p, box } = c;
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  g.fillStyle = p.line;
  for (let x = 130; x < box.w - 90; x += 16)
    for (let y = 8; y < box.h; y += 16) g.fillRect(box.x + x, box.y + y, 1, 1);
  g.fillStyle = p.panel;
  g.fillRect(box.x, box.y, 120, box.h);
  g.fillRect(box.x + box.w - 90, box.y, 90, box.h);
  text(g, 'layers', box.x + 10, box.y + 18, p.dim, 11);
  for (let i = 0; i < 9; i++) {
    g.fillStyle = i === 2 ? c.accent : p.dim;
    g.globalAlpha = i === 2 ? 0.9 : 0.5;
    g.fillRect(box.x + 14 + (i % 3 === 0 ? 0 : 10), box.y + 32 + i * 18, 40 + r() * 50, 5);
  }
  g.globalAlpha = 1;
}

function drawFrames(c: ViewCtx, r: Rng): void {
  const { g, p, box } = c;
  FRAMES.forEach((f, i) => {
    g.fillStyle = p.text;
    g.globalAlpha = 0.9;
    roundRect(g, box.x + f.x, box.y + f.y, f.w, f.h, 6);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = i === 1 ? c.accent : p.line;
    g.fillRect(box.x + f.x + 8, box.y + f.y + 10, f.w * 0.5, 8);
    textBars(g, r, box.x + f.x + 8, box.y + f.y + 28, f.w - 16, 3, p.line);
  });
}

function drawSelection(c: ViewCtx, selected: Frame): void {
  const { g, p, box } = c;
  g.strokeStyle = c.accent;
  g.lineWidth = 1.5;
  g.strokeRect(box.x + selected.x, box.y + selected.y, selected.w, selected.h);
  g.fillStyle = p.bg;
  for (const [hx, hy] of HANDLES) {
    const x = box.x + selected.x + hx * selected.w - 3;
    const y = box.y + selected.y + hy * selected.h - 3;
    g.fillRect(x, y, 6, 6);
    g.strokeRect(x, y, 6, 6);
  }
}

/** The pointer drifting over the canvas, and the side bar's rows. */
function drawCursor(c: ViewCtx): void {
  const { g, p, box } = c;
  const t = c.moving ? c.now / 2300 : 0;
  const cx = box.x + 250 + Math.sin(t) * 120;
  const cy = box.y + 140 + Math.sin(t * 1.7 + 1) * 70;
  g.fillStyle = p.text;
  g.beginPath();
  g.moveTo(cx, cy);
  g.lineTo(cx + 11, cy + 4);
  g.lineTo(cx + 5, cy + 6);
  g.lineTo(cx + 3, cy + 12);
  g.closePath();
  g.fill();
  g.fillStyle = c.accent;
  for (let i = 0; i < 5; i++) g.fillRect(box.x + box.w - 78, box.y + 30 + i * 26, 56, 6);
}

/** A design canvas: frames of page-shaped boxes, a selected one with handles, a layers list, a cursor drifting between them. */
export function drawDesign(c: ViewCtx): void {
  const r = viewRng(c, 'design');
  drawDesignChrome(c, r);
  drawFrames(c, r);
  // A different one is picked now and then.
  const selected = FRAMES[Math.floor(c.now / 7000) % FRAMES.length];
  if (selected) drawSelection(c, selected);
  drawCursor(c);
}
