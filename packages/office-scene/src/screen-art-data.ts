import { PALETTE, SCREEN_W, frame, bars, tile, Draw } from './screen-draw.js';

/** Data screens: tables, a training run and KPI charts. */
export const dataTables: Draw = (g, r, a) => {
  frame(g, 'warehouse · schema · query', a);
  for (const [x, y, n] of [
    [24, 50, 6],
    [230, 90, 5],
    [436, 60, 7],
  ] as const) {
    tile(g, x, y, 180, 26 + n * 20, a);
    g.fillStyle = a;
    g.fillRect(x, y, 180, 24);
    for (let i = 0; i < n; i++) {
      g.fillStyle = i === 0 ? PALETTE.amber : PALETTE.dim;
      g.fillRect(x + 10, y + 34 + i * 20, 60 + r() * 60, 7);
    }
  }
  g.strokeStyle = PALETTE.blue;
  g.lineWidth = 1.5;
  g.beginPath();
  g.moveTo(204, 110);
  g.lineTo(230, 130);
  g.moveTo(410, 150);
  g.lineTo(436, 120);
  g.stroke();
  tile(g, 24, 270, SCREEN_W - 48, 112);
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 6; col++) {
      g.fillStyle = row === 0 ? PALETTE.text : PALETTE.dim;
      g.fillRect(36 + col * 98, 284 + row * 19, 50 + r() * 30, 7);
    }
};

export const training: Draw = (g, r, a) => {
  frame(g, 'training · loss · eval', a);
  tile(g, 14, 44, 380, 200);
  g.strokeStyle = a;
  g.lineWidth = 2.5;
  g.beginPath();
  for (let i = 0; i <= 60; i++) {
    const v = Math.exp(-i / (14 + r() * 4)) * 0.85 + r() * 0.05 + 0.05;
    const x = 24 + (360 * i) / 60;
    const y = 54 + (1 - v) * 180;
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  }
  g.stroke();
  tile(g, 404, 44, 222, 336);
  const layers = [4, 6, 6, 3];
  const nodes: [number, number][][] = layers.map((n, l) =>
    Array.from(
      { length: n },
      (_, i) => [440 + l * 52, 80 + (i + (6 - n) / 2) * 46] as [number, number],
    ),
  );
  g.strokeStyle = PALETTE.line;
  g.lineWidth = 1;
  for (const [l, layer] of nodes.slice(0, -1).entries())
    for (const p of layer)
      for (const q of nodes[l + 1] ?? []) {
        g.globalAlpha = 0.2 + r() * 0.6;
        g.beginPath();
        g.moveTo(...p);
        g.lineTo(...q);
        g.stroke();
      }
  g.globalAlpha = 1;
  for (const layer of nodes)
    for (const [x, y] of layer) {
      g.fillStyle = a;
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  tile(g, 14, 254, 380, 126);
  bars(g, r, 24, 264, 360, 106, PALETTE.violet, 16);
};

export const kpis: Draw = (g, r, a) => {
  frame(g, 'analytics · dashboard', a);
  for (const [i, color] of [a, PALETTE.green, PALETTE.amber, PALETTE.violet].entries()) {
    const x = 14 + i * 156;
    tile(g, x, 44, 146, 76, i === 0 ? a : undefined);
    g.fillStyle = PALETTE.dim;
    g.fillRect(x + 12, 58, 70, 7);
    g.fillStyle = color;
    g.fillRect(x + 12, 76, 60 + r() * 50, 24);
  }
  tile(g, 14, 130, 400, 252);
  bars(g, r, 26, 150, 376, 220, a, 14);
  tile(g, 424, 130, 202, 252);
  const cx = 525;
  const cy = 256;
  let start = 0;
  for (const c of [a, PALETTE.violet, PALETTE.amber, PALETTE.blue]) {
    const slice = 0.15 + r() * 0.35;
    g.fillStyle = c;
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, 80, start, Math.min(Math.PI * 2, start + slice * Math.PI * 2));
    g.fill();
    start += slice * Math.PI * 2;
  }
  g.fillStyle = PALETTE.panel;
  g.beginPath();
  g.arc(cx, cy, 44, 0, Math.PI * 2);
  g.fill();
};
