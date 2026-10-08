import { pick } from '../environment/pick.js';

/** Drawing primitives shared by the role screens: the frame, text lines, charts, bars and tiles on a 640 by 400 canvas. */
export const SCREEN_W = 640;
export const SCREEN_H = 400;

export type Draw = (g: CanvasRenderingContext2D, r: () => number, accent: string) => void;

export const PALETTE = {
  bg: '#061019',
  panel: '#0c1c28',
  line: '#1d3a4c',
  text: '#cfe8f0',
  dim: '#5f8496',
  green: '#3ee8a4',
  red: '#ff6b7d',
  amber: '#ffc65c',
  blue: '#6aa8ff',
  violet: '#a592ff',
};

export function frame(g: CanvasRenderingContext2D, title: string, accent: string) {
  g.fillStyle = PALETTE.bg;
  g.fillRect(0, 0, SCREEN_W, SCREEN_H);
  g.fillStyle = PALETTE.panel;
  g.fillRect(0, 0, SCREEN_W, 30);
  g.fillStyle = accent;
  g.fillRect(0, 29, SCREEN_W, 2);
  for (const [i, c] of [PALETTE.red, PALETTE.amber, PALETTE.green].entries()) {
    g.fillStyle = c;
    g.beginPath();
    g.arc(16 + i * 16, 15, 5, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = PALETTE.text;
  g.font = '600 14px ui-monospace, Menlo, monospace';
  g.fillText(title, 72, 20);
}

export function codeLines(
  g: CanvasRenderingContext2D,
  r: () => number,
  x: number,
  y: number,
  w: number,
  rows: number,
) {
  const colors = [
    PALETTE.violet,
    PALETTE.blue,
    PALETTE.green,
    PALETTE.amber,
    PALETTE.text,
    PALETTE.dim,
  ];
  for (let i = 0; i < rows; i++) {
    g.fillStyle = PALETTE.dim;
    g.font = '11px ui-monospace, Menlo, monospace';
    g.fillText(String(i + 1).padStart(3, ' '), x, y + i * 17 + 10);
    let cx = x + 34 + Math.floor(r() * 4) * 14;
    const segments = 2 + Math.floor(r() * 5);
    for (let s = 0; s < segments && cx < x + w; s++) {
      const len = 18 + r() * 90;
      g.fillStyle = pick(r, colors);
      g.fillRect(cx, y + i * 17, Math.min(len, x + w - cx), 9);
      cx += len + 7;
    }
  }
}

export function lineChart(
  g: CanvasRenderingContext2D,
  r: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
) {
  g.strokeStyle = PALETTE.line;
  g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    g.beginPath();
    g.moveTo(x, y + (h * i) / 4);
    g.lineTo(x + w, y + (h * i) / 4);
    g.stroke();
  }
  g.strokeStyle = color;
  g.lineWidth = 2.5;
  g.beginPath();
  let v = 0.5;
  for (let i = 0; i <= 40; i++) {
    v = Math.min(0.95, Math.max(0.05, v + (r() - 0.5) * 0.18));
    const px = x + (w * i) / 40;
    const py = y + h - v * h;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.stroke();
}

export function bars(
  g: CanvasRenderingContext2D,
  r: () => number,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  n = 12,
) {
  const bw = w / n - 4;
  for (let i = 0; i < n; i++) {
    const bh = (0.2 + r() * 0.8) * h;
    g.fillStyle = color;
    g.globalAlpha = 0.55 + r() * 0.45;
    g.fillRect(x + i * (bw + 4), y + h - bh, bw, bh);
  }
  g.globalAlpha = 1;
}

export function label(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string = PALETTE.text,
  size = 12,
) {
  g.fillStyle = color;
  g.font = `${size}px ui-monospace, Menlo, monospace`;
  g.fillText(text, x, y);
}

export function tile(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  accent?: string,
) {
  g.fillStyle = PALETTE.panel;
  g.fillRect(x, y, w, h);
  g.strokeStyle = accent ?? PALETTE.line;
  g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
}
