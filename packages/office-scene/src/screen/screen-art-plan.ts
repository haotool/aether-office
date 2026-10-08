import { PALETTE, SCREEN_W, frame, label, tile, Draw } from './screen-draw.js';

/** Planning screens: an architecture sketch, documents, a kanban board and a mind map. */
export const architecture: Draw = (g, r, a) => {
  frame(g, 'architecture · services', a);
  const boxes: [number, number][] = [];
  for (let i = 0; i < 7; i++)
    boxes.push([40 + (i % 4) * 150 + (Math.floor(i / 4) ? 70 : 0), 70 + Math.floor(i / 4) * 160]);
  g.strokeStyle = PALETTE.blue;
  g.lineWidth = 1.5;
  for (const [i, p] of boxes.entries()) {
    const q = boxes[(i + 1 + Math.floor(r() * 3)) % boxes.length] ?? p;
    g.beginPath();
    g.moveTo(p[0] + 55, p[1] + 30);
    g.lineTo(q[0] + 55, q[1] + 30);
    g.stroke();
  }
  for (const [x, y] of boxes) {
    tile(g, x, y, 110, 60, a);
    g.fillStyle = a;
    g.fillRect(x, y, 110, 16);
    g.fillStyle = PALETTE.dim;
    g.fillRect(x + 10, y + 28, 70 + r() * 20, 7);
    g.fillRect(x + 10, y + 42, 50 + r() * 30, 7);
  }
};

export const documents: Draw = (g, r, a) => {
  frame(g, 'docs · guide.md', a);
  tile(g, 70, 40, 500, 350);
  g.fillStyle = PALETTE.text;
  g.fillRect(96, 62, 260, 18);
  let y = 100;
  for (let section = 0; section < 3; section++) {
    g.fillStyle = a;
    g.fillRect(96, y, 160 + r() * 80, 12);
    y += 24;
    for (let i = 0; i < 3 + Math.floor(r() * 2); i++) {
      g.fillStyle = PALETTE.dim;
      g.fillRect(96, y, 300 + r() * 140, 7);
      y += 15;
    }
    y += 16;
  }
};

export const kanban: Draw = (g, r, a) => {
  frame(g, 'roadmap · board', a);
  ['backlog', 'next', 'doing', 'done'].forEach((name, c) => {
    const x = 14 + c * 156;
    label(g, name.toUpperCase(), x + 6, 52, c === 2 ? a : PALETTE.dim, 11);
    const n = 2 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      tile(g, x, 62 + i * 64, 146, 56, c === 2 ? a : undefined);
      g.fillStyle = PALETTE.text;
      g.fillRect(x + 10, 74 + i * 64, 90 + r() * 30, 7);
      g.fillStyle = PALETTE.dim;
      g.fillRect(x + 10, 90 + i * 64, 60 + r() * 50, 6);
    }
  });
};

export const mindmap: Draw = (g, r, a) => {
  frame(g, 'research · comparison', a);
  const cx = SCREEN_W / 2;
  const cy = 215;
  g.fillStyle = a;
  g.beginPath();
  g.arc(cx, cy, 26, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 8; i++) {
    const t = (i / 8) * Math.PI * 2 + r() * 0.3;
    const x = cx + Math.cos(t) * 160;
    const y = cy + Math.sin(t) * 120;
    g.strokeStyle = PALETTE.line;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(x, y);
    g.stroke();
    tile(g, x - 46, y - 14, 92, 28, i % 3 ? undefined : a);
    g.fillStyle = PALETTE.dim;
    g.fillRect(x - 36, y - 3, 50 + r() * 20, 6);
  }
};
