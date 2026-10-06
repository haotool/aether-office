import { PALETTE, SCREEN_W, frame, label, tile, Draw } from './screen-draw.js';

/** Quality and review screens: a test run, a security scan and a diff. */
export const tests: Draw = (g, r, a) => {
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

export const security: Draw = (g, r, a) => {
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

export const diff: Draw = (g, r, a) => {
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
