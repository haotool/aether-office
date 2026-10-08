import { CanvasTexture, SRGBColorSpace } from 'three';
import type { Secondary, Theme } from '../desks/desk-profile.js';
import { seeded, type Rng } from '../environment/seeded.js';
import { PALETTES, type Palette } from './screen-theme.js';
import { polyline, roundRect, textBars, wander } from './screen-ui.js';
import { context2d } from '../core/canvas-2d.js';

/**
 * The second monitor of a desk: a reference window (docs, a page, a log, a chat, a dashboard) shown as shapes, never as
 * facts. Every desk with the same look shares one canvas and one texture, repainted every few seconds, so a second
 * monitor costs one upload per few seconds for the whole office, not one per member.
 */
export const SECONDARY_W = 320;
export const SECONDARY_H = 250;
const REPAINT_MS = 4000;

type Entry = {
  texture: CanvasTexture;
  g: CanvasRenderingContext2D;
  refs: number;
  lastAt: number;
  key: string;
};
const shared = new Map<string, Entry>();

type Paint = (
  g: CanvasRenderingContext2D,
  r: Rng,
  p: Palette,
  accent: string,
  step: number,
) => void;

const PAINTERS: Record<Secondary, Paint> = {
  docs(g, r, p, _accent, step) {
    g.fillStyle = p.text;
    g.fillRect(16, 32 - step * 3, 120, 10);
    for (let i = 0; i < 6; i++) textBars(g, r, 16, 52 + i * 48 - step * 3, 270, 4, p.line);
  },
  browser(g, r, p, accent, step) {
    g.fillStyle = accent;
    g.globalAlpha = 0.2;
    g.fillRect(0, 22 - step * 2, SECONDARY_W, 44);
    g.globalAlpha = 1;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = p.panel;
      g.fillRect(16 + (i % 2) * 150, 80 + Math.floor(i / 2) * 60 - step * 2, 138, 50);
      textBars(g, r, 24 + (i % 2) * 150, 90 + Math.floor(i / 2) * 60 - step * 2, 120, 3, p.line);
    }
  },
  terminal(g, r, p, accent, step) {
    for (let i = 0; i < 14; i++) {
      g.fillStyle = i % 5 === 0 ? accent : p.dim;
      g.globalAlpha = 0.7;
      g.fillRect(12, 28 + ((i + step) % 14) * 12, 40 + r() * 190, 5);
    }
    g.globalAlpha = 1;
  },
  chat(g, r, p, accent, step) {
    for (let i = 0; i < 5; i++) {
      const own = (i + step) % 2 === 0;
      g.fillStyle = own ? accent : p.panel;
      g.globalAlpha = own ? 0.3 : 1;
      roundRect(g, own ? 120 : 14, 28 + i * 34, 180, 26, 8);
      g.fill();
      g.globalAlpha = 1;
      textBars(g, r, own ? 132 : 26, 36 + i * 34, 150, 2, p.line);
    }
  },
  dashboard(g, _r, p, accent, step) {
    for (let i = 0; i < 4; i++) {
      const x = 10 + (i % 2) * 155;
      const y = 26 + Math.floor(i / 2) * 84;
      g.fillStyle = p.panel;
      g.fillRect(x, y, 145, 76);
      polyline(
        g,
        wander(seeded(`secondary:dash:${i}`), 24),
        x + 8,
        y + 10,
        129,
        56,
        i % 2 ? accent : p.info,
        step,
      );
    }
  },
};

function paintKind(
  g: CanvasRenderingContext2D,
  kind: Secondary,
  p: Palette,
  accent: string,
  step: number,
): void {
  const r = seeded(`secondary:${kind}`);
  g.fillStyle = p.bg;
  g.fillRect(0, 0, SECONDARY_W, SECONDARY_H);
  g.fillStyle = p.panel;
  g.fillRect(0, 0, SECONDARY_W, 18);
  g.fillStyle = accent;
  g.fillRect(0, 17, SECONDARY_W, 2);
  PAINTERS[kind](g, r, p, accent, step);
}

/** The shared screen for a look; `release` it when the member goes. */
export function acquireSecondary(kind: Secondary, theme: Theme, accent: string) {
  const key = `${kind}|${theme}|${accent}`;
  let entry = shared.get(key);
  if (!entry) {
    const canvas = document.createElement('canvas');
    canvas.width = SECONDARY_W;
    canvas.height = SECONDARY_H;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    entry = { texture, g: context2d(canvas), refs: 0, lastAt: -Infinity, key };
    shared.set(key, entry);
  }
  entry.refs++;
  const held = entry;
  return {
    texture: held.texture,
    /** Repaints the shared canvas if it is due (the first caller of a round does the work for all). */
    paint(now: number, moving: boolean) {
      if (now - held.lastAt < REPAINT_MS) return;
      held.lastAt = now;
      paintKind(
        held.g,
        kind,
        PALETTES[theme],
        accent,
        moving ? Math.floor(now / REPAINT_MS) % 6 : 0,
      );
      held.texture.needsUpdate = true;
    },
    release() {
      if (--held.refs > 0) return;
      held.texture.dispose();
      shared.delete(held.key);
    },
  };
}
