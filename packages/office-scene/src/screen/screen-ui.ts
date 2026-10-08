import type { Rng } from '../environment/seeded.js';
import { MONO } from './screen-theme.js';

/** Small drawing helpers shared by the desk views. */

/** Text cut to a width with an ellipsis; one line. The font must be set on `g` first. */
export function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && g.measureText(`${text.slice(0, end)}…`).width > width) end--;
  return `${text.slice(0, end)}…`;
}

export function text(
  g: CanvasRenderingContext2D,
  s: string,
  x: number,
  y: number,
  color: string,
  size = 12,
  font: string = MONO,
  weight = '',
): void {
  g.font = `${weight} ${size}px ${font}`.trim();
  g.fillStyle = color;
  g.fillText(s, x, y);
}

/** A rounded rectangle path (filled by the caller). */
export function roundRect(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** A wavy line under a stretch of text: how an editor marks a problem. */
export function squiggle(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  color: string,
): void {
  g.strokeStyle = color;
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x, y);
  for (let i = 0; i < w; i += 2) g.lineTo(x + i + 1, y + (i % 4 === 0 ? 2 : 0));
  g.stroke();
}

/** A polyline of `n` points whose height wanders: a sparkline's shape (a picture of a series, never one). */
export function wander(r: Rng, n: number, drift = 0.22): number[] {
  const out: number[] = [];
  let v = 0.3 + r() * 0.4;
  for (let i = 0; i < n; i++) {
    v = Math.min(0.95, Math.max(0.05, v + (r() - 0.5) * drift));
    out.push(v);
  }
  return out;
}

export function polyline(
  g: CanvasRenderingContext2D,
  values: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  shift = 0,
): void {
  g.strokeStyle = color;
  g.lineWidth = 1.8;
  g.beginPath();
  const n = values.length;
  for (let i = 0; i < n; i++) {
    const v = values[(i + shift) % n] ?? 0;
    const px = x + (w * i) / (n - 1);
    const py = y + h - v * h;
    if (i) g.lineTo(px, py);
    else g.moveTo(px, py);
  }
  g.stroke();
}

/** A paragraph's worth of grey bars standing for lines of text: used where the words themselves are not ours to invent. */
export function textBars(
  g: CanvasRenderingContext2D,
  r: Rng,
  x: number,
  y: number,
  w: number,
  lines: number,
  color: string,
  gap = 9,
): void {
  for (let i = 0; i < lines; i++) {
    const last = i === lines - 1;
    g.fillStyle = color;
    g.fillRect(x, y + i * gap, w * (last ? 0.3 + r() * 0.4 : 0.85 + r() * 0.15), 4);
  }
}
