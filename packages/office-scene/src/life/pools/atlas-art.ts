import { CELLS, type CellId } from '../effects/types.js';
import { SIGN_ART } from './atlas-art-signs.js';
import { ATLAS_COLUMNS, CELL_PX, C, blob, label, rounded, soft, type Ctx } from './atlas-draw.js';

export { ATLAS_COLUMNS, CELL_PX } from './atlas-draw.js';
export const ATLAS_ROWS = Math.ceil(CELLS.length / ATLAS_COLUMNS);
export const ATLAS_WIDTH = CELL_PX * ATLAS_COLUMNS;
export const ATLAS_HEIGHT = CELL_PX * ATLAS_ROWS;

const ART: Record<CellId, (g: Ctx) => void> = {
  ...SIGN_ART,
  duck(g) {
    blob(g, 60, 80, 36, 26, '#f6c92b');
    blob(g, 82, 44, 20, 20, '#f6c92b');
    blob(g, 46, 74, 16, 12, '#e5b218'); // wing
    g.fillStyle = '#f08a24';
    g.beginPath();
    g.moveTo(98, 42);
    g.lineTo(118, 48);
    g.lineTo(98, 54);
    g.fill();
    blob(g, 86, 38, 4, 4, '#1c1c24');
  },
  glow: (g) => soft(g, C, 1),
  bug(g) {
    g.strokeStyle = '#33281c';
    g.lineWidth = 4;
    for (const dy of [-18, 0, 18]) {
      g.beginPath();
      g.moveTo(34, C + dy);
      g.lineTo(94, C + dy * 1.4);
      g.stroke();
    }
    blob(g, C, C, 30, 22, '#58b873');
    blob(g, 96, C, 12, 12, '#2f7f49');
    blob(g, 100, 56, 3, 3, '#fff');
    blob(g, 100, 72, 3, 3, '#fff');
  },
  hole(g) {
    const gradient = g.createRadialGradient(C, C, 0, C, C, C);
    gradient.addColorStop(0, 'rgba(10,6,24,1)');
    gradient.addColorStop(0.45, 'rgba(70,40,150,0.95)');
    gradient.addColorStop(1, 'rgba(120,80,220,0)');
    g.fillStyle = gradient;
    g.fillRect(0, 0, CELL_PX, CELL_PX);
    g.strokeStyle = 'rgba(200,170,255,0.85)';
    g.lineWidth = 4;
    for (let arm = 0; arm < 3; arm += 1) {
      g.beginPath();
      for (let s = 0; s <= 40; s += 1) {
        const a = arm * 2.094 + s * 0.11;
        const r = 6 + s * 1.35;
        g.lineTo(C + Math.cos(a) * r, C + Math.sin(a) * r);
      }
      g.stroke();
    }
  },
  rocket(g) {
    g.fillStyle = '#e8ecf4';
    g.beginPath();
    g.moveTo(C, 8);
    g.quadraticCurveTo(C + 24, 40, C + 18, 88);
    g.lineTo(C - 18, 88);
    g.quadraticCurveTo(C - 24, 40, C, 8);
    g.fill();
    g.fillStyle = '#e0504a';
    g.beginPath();
    g.moveTo(C - 18, 88);
    g.lineTo(C - 36, 108);
    g.lineTo(C - 14, 98);
    g.moveTo(C + 18, 88);
    g.lineTo(C + 36, 108);
    g.lineTo(C + 14, 98);
    g.fill();
    blob(g, C, 52, 9, 9, '#4aa3df');
    blob(g, C, 108, 9, 14, '#ffb03a');
  },
  plane(g) {
    g.fillStyle = '#f4f6fb';
    g.beginPath();
    g.moveTo(14, 64);
    g.lineTo(116, 20);
    g.lineTo(76, 108);
    g.lineTo(62, 76);
    g.fill();
    g.fillStyle = '#b7c3dc';
    g.beginPath();
    g.moveTo(62, 76);
    g.lineTo(116, 20);
    g.lineTo(72, 66);
    g.fill();
  },
  bell(g) {
    g.fillStyle = '#f2b73a';
    g.beginPath();
    g.moveTo(C, 12);
    g.bezierCurveTo(C + 40, 12, C + 34, 70, C + 46, 90);
    g.lineTo(C - 46, 90);
    g.bezierCurveTo(C - 34, 70, C - 40, 12, C, 12);
    g.fill();
    blob(g, C, 100, 10, 10, '#c98a1b');
    rounded(g, C - 5, 4, 10, 10, 4, '#c98a1b');
  },
  steam(g) {
    soft(g, 54, 0.85);
    blob(g, C + 12, C - 8, 22, 22, 'rgba(255,255,255,0.35)');
  },
  loop(g) {
    g.strokeStyle = '#ffb347';
    g.lineWidth = 12;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(C, C, 40, -0.6, Math.PI * 1.55);
    g.stroke();
    g.fillStyle = '#ffb347';
    g.beginPath();
    g.moveTo(C + 28, C - 62);
    g.lineTo(C + 62, C - 40);
    g.lineTo(C + 22, C - 28);
    g.fill();
  },
  keyc: (g) => key(g, 'C'),
  keyv: (g) => key(g, 'V'),
  vim(g) {
    rounded(g, 6, 28, 116, 72, 14, '#1d2430');
    g.strokeStyle = '#3fbf6f';
    g.lineWidth = 4;
    g.strokeRect(14, 36, 100, 56);
    label(g, ':q!', 66, 44, '#7dffa8');
  },
  box(g) {
    rounded(g, 12, 24, 104, 88, 8, '#c8964e');
    g.fillStyle = '#a97a38';
    g.fillRect(12, 24, 104, 16);
    g.fillStyle = '#e8d3a0';
    g.fillRect(C - 9, 24, 18, 60);
  },
  confetti(g) {
    g.fillStyle = '#fff';
    g.fillRect(34, 54, 60, 20);
  },
  ring(g) {
    g.strokeStyle = '#fff';
    g.lineWidth = 6;
    g.beginPath();
    g.arc(C, C, 56, 0, Math.PI * 2);
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.lineWidth = 12;
    g.beginPath();
    g.arc(C, C, 50, 0, Math.PI * 2);
    g.stroke();
  },
  spark(g) {
    soft(g, 40, 1);
    blob(g, C, C, 9, 9, '#fff');
  },
};

function key(g: Ctx, letter: string) {
  rounded(g, 12, 14, 104, 100, 18, '#2a3140');
  rounded(g, 18, 18, 92, 82, 14, '#eef1f7');
  label(g, 'Ctrl', 40, 22, '#59627a');
  label(g, letter, 76, 46, '#1d2430');
}

/** Draws every cell of the atlas onto a canvas: one picture per `CELLS` entry, in that order. */
export function drawAtlas(canvas: HTMLCanvasElement): void {
  canvas.width = ATLAS_WIDTH;
  canvas.height = ATLAS_HEIGHT;
  const g = canvas.getContext('2d')!;
  CELLS.forEach((id, i) => {
    g.save();
    g.translate((i % ATLAS_COLUMNS) * CELL_PX, Math.floor(i / ATLAS_COLUMNS) * CELL_PX);
    g.beginPath();
    g.rect(0, 0, CELL_PX, CELL_PX);
    g.clip();
    ART[id](g);
    g.restore();
  });
}
