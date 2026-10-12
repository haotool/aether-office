export const CELL_PX = 128;
export const ATLAS_COLUMNS = 8;

export type Ctx = CanvasRenderingContext2D;
export const C = CELL_PX / 2;

export const blob = (g: Ctx, x: number, y: number, rx: number, ry: number, fill: string) => {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  g.fill();
};
export const soft = (g: Ctx, radius: number, inner: number) => {
  const gradient = g.createRadialGradient(C, C, 0, C, C, radius);
  gradient.addColorStop(0, `rgba(255,255,255,${inner})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gradient;
  g.fillRect(0, 0, CELL_PX, CELL_PX);
};
export const label = (g: Ctx, text: string, y: number, px: number, color: string) => {
  g.font = `bold ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.fillText(text, C, y);
};
export const rounded = (
  g: Ctx,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
  fill: string,
) => {
  g.fillStyle = fill;
  g.beginPath();
  g.roundRect(x, y, w, h, r);
  g.fill();
};
