import {
  PALETTE,
  SCREEN_W,
  SCREEN_H,
  frame,
  codeLines,
  lineChart,
  label,
  tile,
  Draw,
} from './screen-draw.js';
import { pick } from '../environment/pick.js';

export const editor: Draw = (g, r, a) => {
  frame(g, 'workspace / src / module.ts', a);
  tile(g, 0, 31, 120, SCREEN_H - 31);
  for (let i = 0; i < 14; i++) {
    g.fillStyle = i === 3 ? a : PALETTE.dim;
    g.fillRect(14 + (i % 3) * 8, 48 + i * 22, 60 + r() * 30, 8);
  }
  codeLines(g, r, 132, 46, 440, 20);
  g.fillStyle = PALETTE.line;
  g.fillRect(SCREEN_W - 50, 31, 50, SCREEN_H - 31);
  for (let i = 0; i < 60; i++) {
    g.fillStyle = r() > 0.5 ? PALETTE.dim : a;
    g.fillRect(SCREEN_W - 44, 36 + i * 6, 10 + r() * 28, 3);
  }
};

export const browserUi: Draw = (g, r, a) => {
  frame(g, 'localhost:5173 · preview', a);
  tile(g, 20, 44, SCREEN_W - 40, 46, a);
  g.fillStyle = a;
  g.fillRect(36, 58, 90, 18);
  for (let i = 0; i < 4; i++) {
    g.fillStyle = PALETTE.dim;
    g.fillRect(SCREEN_W - 300 + i * 66, 62, 50, 9);
  }
  for (let c = 0; c < 3; c++) {
    const x = 20 + c * 204;
    tile(g, x, 104, 192, 170);
    g.fillStyle = pick(r, [PALETTE.violet, PALETTE.blue, PALETTE.green]);
    g.globalAlpha = 0.35;
    g.fillRect(x + 10, 114, 172, 80);
    g.globalAlpha = 1;
    g.fillStyle = PALETTE.text;
    g.fillRect(x + 10, 206, 120, 10);
    g.fillStyle = PALETTE.dim;
    g.fillRect(x + 10, 224, 160, 7);
    g.fillRect(x + 10, 238, 140, 7);
    g.fillStyle = a;
    g.fillRect(x + 10, 252, 64, 14);
  }
  tile(g, 20, 288, SCREEN_W - 40, 92);
  codeLines(g, r, 30, 300, SCREEN_W - 70, 4);
};

export const apiLogs: Draw = (g, r, a) => {
  frame(g, 'service · request log', a);
  const verbs = ['GET', 'POST', 'PUT', 'DELETE'];
  const paths = [
    '/api/orders',
    '/api/users/:id',
    '/api/invoices',
    '/health',
    '/api/sessions',
    '/api/search',
  ];
  for (let i = 0; i < 18; i++) {
    const status = r() > 0.88 ? 500 : r() > 0.8 ? 404 : 200;
    const y = 52 + i * 19;
    label(g, pick(r, verbs).padEnd(6), 18, y, PALETTE.blue);
    label(g, pick(r, paths), 76, y, PALETTE.text);
    label(
      g,
      String(status),
      330,
      y,
      status === 200 ? PALETTE.green : status === 404 ? PALETTE.amber : PALETTE.red,
    );
    g.fillStyle = a;
    g.globalAlpha = 0.6;
    g.fillRect(380, y - 9, 20 + r() * 200, 9);
    g.globalAlpha = 1;
  }
};

export const phones: Draw = (g, r, a) => {
  frame(g, 'simulator · iPhone · Pixel', a);
  for (const x of [120, 360]) {
    g.fillStyle = '#0f2230';
    g.fillRect(x, 44, 160, 340);
    g.strokeStyle = a;
    g.strokeRect(x + 0.5, 44.5, 159, 339);
    g.fillStyle = PALETTE.line;
    g.fillRect(x + 50, 52, 60, 8);
    for (let i = 0; i < 5; i++) {
      g.fillStyle = i === 0 ? a : PALETTE.panel;
      g.fillRect(x + 12, 72 + i * 58, 136, 48);
      g.fillStyle = PALETTE.dim;
      g.fillRect(x + 20, 82 + i * 58, 70 + r() * 40, 7);
      g.fillRect(x + 20, 96 + i * 58, 40 + r() * 50, 6);
    }
  }
};

export const pipeline: Draw = (g, r, a) => {
  frame(g, 'ci / pipeline · deploy', a);
  const stages = ['checkout', 'install', 'lint', 'test', 'build', 'deploy'];
  stages.forEach((s, i) => {
    const x = 18 + i * 102;
    const state =
      i < 4 ? PALETTE.green : i === 4 ? (r() > 0.3 ? PALETTE.amber : PALETTE.green) : PALETTE.dim;
    tile(g, x, 60, 90, 60, state);
    g.fillStyle = state;
    g.beginPath();
    g.arc(x + 16, 90, 7, 0, Math.PI * 2);
    g.fill();
    label(g, s, x + 30, 94, PALETTE.text, 11);
    if (i < stages.length - 1) {
      g.fillStyle = PALETTE.line;
      g.fillRect(x + 90, 89, 12, 2);
    }
  });
  label(g, 'pods', 18, 150, PALETTE.dim);
  for (let i = 0; i < 32; i++) {
    const x = 18 + (i % 16) * 38;
    const y = 162 + Math.floor(i / 16) * 38;
    g.fillStyle = r() > 0.92 ? PALETTE.red : r() > 0.85 ? PALETTE.amber : a;
    g.globalAlpha = 0.75;
    g.fillRect(x, y, 30, 30);
    g.globalAlpha = 1;
  }
  tile(g, 18, 250, SCREEN_W - 36, 132);
  codeLines(g, r, 26, 262, SCREEN_W - 60, 7);
};

export const monitoring: Draw = (g, r, a) => {
  frame(g, 'observability · latency · errors', a);
  tile(g, 14, 44, 400, 160);
  lineChart(g, r, 24, 54, 380, 140, a);
  tile(g, 424, 44, 202, 160);
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 10; x++) {
      const v = r();
      g.fillStyle = v > 0.9 ? PALETTE.red : v > 0.7 ? PALETTE.amber : a;
      g.globalAlpha = 0.25 + v * 0.75;
      g.fillRect(432 + x * 19, 54 + y * 18, 16, 15);
    }
  g.globalAlpha = 1;
  tile(g, 14, 214, SCREEN_W - 28, 170);
  lineChart(g, r, 24, 224, SCREEN_W - 48, 70, PALETTE.violet);
  for (const [i, c] of [PALETTE.green, PALETTE.amber, PALETTE.red, PALETTE.green].entries()) {
    g.fillStyle = c;
    g.fillRect(24, 312 + i * 18, 8, 8);
    g.fillStyle = PALETTE.dim;
    g.fillRect(40, 312 + i * 18, 180 + r() * 200, 8);
  }
};

export const releases: Draw = (g, r, a) => {
  frame(g, 'releases · changelog', a);
  g.fillStyle = PALETTE.line;
  g.fillRect(60, 48, 2, 330);
  for (let i = 0; i < 7; i++) {
    const y = 60 + i * 46;
    g.fillStyle = i === 0 ? a : PALETTE.blue;
    g.beginPath();
    g.arc(61, y, 7, 0, Math.PI * 2);
    g.fill();
    label(
      g,
      `v${3 - Math.floor(i / 3)}.${(9 - i) % 10}.${Math.floor(r() * 9)}`,
      82,
      y + 4,
      i === 0 ? a : PALETTE.text,
      13,
    );
    g.fillStyle = PALETTE.dim;
    g.fillRect(170, y - 4, 200 + r() * 220, 7);
    g.fillRect(170, y + 8, 120 + r() * 160, 6);
  }
};
