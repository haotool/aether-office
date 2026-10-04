import { CanvasTexture, SRGBColorSpace } from 'three';
import { seeded } from './random.js';

/**
 * Role-themed screen art for the holographic workstations. It is decoration that says what kind of work a desk does
 * (a test runner for QA, a pipeline for platform, charts for analytics), never data: nothing here is a measurement,
 * and how bright a screen is comes from the member's real activity, set by the scene.
 * Variety is deterministic: the same member always gets the same picture.
 */
export const SCREEN_W = 640;
export const SCREEN_H = 400;
const VARIANTS = 3;

type Draw = (g: CanvasRenderingContext2D, r: () => number, accent: string) => void;

const PALETTE = {
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

function frame(g: CanvasRenderingContext2D, title: string, accent: string) {
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

function codeLines(
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
      g.fillStyle = colors[Math.floor(r() * colors.length)]!;
      g.fillRect(cx, y + i * 17, Math.min(len, x + w - cx), 9);
      cx += len + 7;
    }
  }
}

function lineChart(
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

function bars(
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

function label(
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

function tile(
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

const editor: Draw = (g, r, a) => {
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

const browserUi: Draw = (g, r, a) => {
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
    g.fillStyle = [PALETTE.violet, PALETTE.blue, PALETTE.green][Math.floor(r() * 3)]!;
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

const apiLogs: Draw = (g, r, a) => {
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
    label(g, verbs[Math.floor(r() * verbs.length)]!.padEnd(6), 18, y, PALETTE.blue);
    label(g, paths[Math.floor(r() * paths.length)]!, 76, y, PALETTE.text);
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

const phones: Draw = (g, r, a) => {
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

const pipeline: Draw = (g, r, a) => {
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

const monitoring: Draw = (g, r, a) => {
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
  for (let i = 0; i < 4; i++) {
    const c = [PALETTE.green, PALETTE.amber, PALETTE.red, PALETTE.green][i]!;
    g.fillStyle = c;
    g.fillRect(24, 312 + i * 18, 8, 8);
    g.fillStyle = PALETTE.dim;
    g.fillRect(40, 312 + i * 18, 180 + r() * 200, 8);
  }
};

const releases: Draw = (g, r, a) => {
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

const tests: Draw = (g, r, a) => {
  frame(g, 'test runner · e2e · unit', a);
  for (let i = 0; i < 16; i++) {
    const ok = r() > 0.1;
    const y = 52 + i * 19;
    label(g, ok ? '✓' : '✗', 18, y, ok ? PALETTE.green : PALETTE.red, 13);
    g.fillStyle = PALETTE.text;
    g.globalAlpha = 0.85;
    g.fillRect(40, y - 9, 140 + r() * 220, 8);
    g.globalAlpha = 1;
    label(g, `${Math.floor(r() * 900 + 20)}ms`, 470, y, PALETTE.dim, 11);
  }
  tile(g, 18, 360, SCREEN_W - 36, 24);
  g.fillStyle = a;
  g.fillRect(20, 362, (SCREEN_W - 40) * (0.7 + r() * 0.28), 20);
};

const security: Draw = (g, r, a) => {
  frame(g, 'security · scan · findings', a);
  const cx = 160;
  const cy = 210;
  for (let i = 1; i <= 4; i++) {
    g.strokeStyle = PALETTE.line;
    g.beginPath();
    g.arc(cx, cy, i * 36, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = a;
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx, cy);
  const angle = r() * Math.PI * 2;
  g.lineTo(cx + Math.cos(angle) * 144, cy + Math.sin(angle) * 144);
  g.stroke();
  for (let i = 0; i < 9; i++) {
    const t = r() * Math.PI * 2;
    const d = 20 + r() * 120;
    g.fillStyle = r() > 0.7 ? PALETTE.red : PALETTE.amber;
    g.beginPath();
    g.arc(cx + Math.cos(t) * d, cy + Math.sin(t) * d, 4, 0, Math.PI * 2);
    g.fill();
  }
  const levels = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  for (let i = 0; i < 10; i++) {
    const level = levels[Math.min(3, Math.floor(r() * 4))]!;
    const y = 56 + i * 32;
    const c =
      level === 'CRITICAL'
        ? PALETTE.red
        : level === 'HIGH'
          ? PALETTE.amber
          : level === 'MEDIUM'
            ? PALETTE.blue
            : PALETTE.dim;
    tile(g, 330, y - 16, 290, 26, c);
    label(g, level, 340, y + 2, c, 11);
    g.fillStyle = PALETTE.dim;
    g.fillRect(420, y - 6, 80 + r() * 110, 7);
  }
};

const diff: Draw = (g, r, a) => {
  frame(g, 'review · diff · comments', a);
  for (let i = 0; i < 19; i++) {
    const kind = r();
    const y = 40 + i * 18;
    if (kind > 0.72) {
      g.fillStyle = '#0f3a2a';
      g.fillRect(0, y, SCREEN_W, 17);
      label(g, '+', 8, y + 13, PALETTE.green);
    } else if (kind < 0.18) {
      g.fillStyle = '#3a1520';
      g.fillRect(0, y, SCREEN_W, 17);
      label(g, '−', 8, y + 13, PALETTE.red);
    }
    g.fillStyle = PALETTE.text;
    g.globalAlpha = 0.75;
    g.fillRect(28 + Math.floor(r() * 3) * 16, y + 5, 80 + r() * 300, 7);
    g.globalAlpha = 1;
  }
  tile(g, 360, 150, 260, 74, a);
  g.fillStyle = PALETTE.dim;
  g.fillRect(372, 166, 200, 7);
  g.fillRect(372, 182, 150, 7);
  g.fillRect(372, 198, 180, 7);
};

const dataTables: Draw = (g, r, a) => {
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

const training: Draw = (g, r, a) => {
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
  for (let l = 0; l < nodes.length - 1; l++)
    for (const p of nodes[l]!)
      for (const q of nodes[l + 1]!) {
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

const kpis: Draw = (g, r, a) => {
  frame(g, 'analytics · dashboard', a);
  for (let i = 0; i < 4; i++) {
    const x = 14 + i * 156;
    tile(g, x, 44, 146, 76, i === 0 ? a : undefined);
    g.fillStyle = PALETTE.dim;
    g.fillRect(x + 12, 58, 70, 7);
    g.fillStyle = [a, PALETTE.green, PALETTE.amber, PALETTE.violet][i]!;
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

const architecture: Draw = (g, r, a) => {
  frame(g, 'architecture · services', a);
  const boxes: [number, number][] = [];
  for (let i = 0; i < 7; i++)
    boxes.push([40 + (i % 4) * 150 + (Math.floor(i / 4) ? 70 : 0), 70 + Math.floor(i / 4) * 160]);
  g.strokeStyle = PALETTE.blue;
  g.lineWidth = 1.5;
  for (let i = 0; i < boxes.length; i++) {
    const p = boxes[i]!;
    const q = boxes[(i + 1 + Math.floor(r() * 3)) % boxes.length]!;
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

const documents: Draw = (g, r, a) => {
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

const kanban: Draw = (g, r, a) => {
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

const mindmap: Draw = (g, r, a) => {
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

const BY_ROLE: Record<string, Draw[]> = {
  frontend: [browserUi, editor],
  backend: [apiLogs, editor],
  fullstack: [editor, browserUi, apiLogs],
  mobile: [phones, editor],
  generalist: [editor, browserUi],
  platform: [pipeline, editor],
  sre: [monitoring, apiLogs],
  release: [releases, pipeline],
  qa: [tests, editor],
  security: [security, diff],
  review: [diff, editor],
  data: [dataTables, editor],
  ml: [training, editor],
  analytics: [kpis, dataTables],
  architect: [architecture, documents],
  docs: [documents, editor],
  'product-manager': [kanban, documents],
  research: [mindmap, documents],
};

const cache = new Map<string, CanvasTexture>();
/** The screen picture for a role and member, made once and reused. Bounded: roles × VARIANTS pictures at most. */
export function screenTexture(role: string, member: string, accent: string): CanvasTexture {
  const draws = BY_ROLE[role] ?? BY_ROLE['generalist']!;
  const variant = Math.floor(seeded(member)() * VARIANTS);
  const key = `${role}:${variant}:${accent}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const g = canvas.getContext('2d')!;
  const rng = seeded(`${role}:${variant}`);
  draws[variant % draws.length]!(g, rng, accent);
  // A faint scanline overlay keeps it reading as a projection rather than a flat monitor.
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 0; y < SCREEN_H; y += 3) g.fillRect(0, y, SCREEN_W, 1);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
}

export const screenRoles = Object.keys(BY_ROLE);
