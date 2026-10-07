// The pictures of wave 2 (outcomes, danger and the programmer-culture signs). The ones an effect tints (tick, cross,
// beetle) are drawn white; the signs carry their own colours. Text is code-culture English or a pictogram.
import { C, CELL_PX, blob, label, rounded, type Ctx } from './atlas-draw.js';

type SignCell =
  | 'tick'
  | 'cross'
  | 'beetle'
  | 'squiggle'
  | 'hazard'
  | 'chevrons'
  | 'skull'
  | 'calendar'
  | 'stamp'
  | 'sticker'
  | 'bugsign'
  | 'featuresign'
  | 'root'
  | 'pipe'
  | 'swirl'
  | 'sticky';

const stroke = (g: Ctx, color: string, width: number) => {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.lineCap = 'round';
  g.lineJoin = 'round';
};

/** A dark terminal chip with a green frame: the base of the command signs. */
const chip = (g: Ctx) => {
  rounded(g, 6, 28, 116, 72, 14, '#1d2430');
  stroke(g, '#3fbf6f', 4);
  g.strokeRect(14, 36, 100, 56);
};

export const SIGN_ART: Record<SignCell, (g: Ctx) => void> = {
  tick(g) {
    stroke(g, '#fff', 16);
    g.beginPath();
    g.moveTo(26, 68);
    g.lineTo(54, 96);
    g.lineTo(102, 34);
    g.stroke();
  },
  cross(g) {
    stroke(g, '#fff', 16);
    g.beginPath();
    g.moveTo(32, 32);
    g.lineTo(96, 96);
    g.moveTo(96, 32);
    g.lineTo(32, 96);
    g.stroke();
  },
  beetle(g) {
    stroke(g, '#dfe3ea', 4);
    for (const dy of [-18, 0, 18]) {
      g.beginPath();
      g.moveTo(34, C + dy);
      g.lineTo(94, C + dy * 1.4);
      g.stroke();
    }
    blob(g, C, C, 30, 22, '#fff');
    blob(g, 96, C, 12, 12, '#c9ced8');
    blob(g, 100, 56, 3, 3, '#1c1c24');
    blob(g, 100, 72, 3, 3, '#1c1c24');
  },
  squiggle(g) {
    stroke(g, '#e0504a', 9);
    g.beginPath();
    for (let x = 6; x <= 122; x += 2) g.lineTo(x, C + Math.sin((x / CELL_PX) * Math.PI * 7) * 14);
    g.stroke();
  },
  hazard(g) {
    g.save();
    g.beginPath();
    g.arc(C, C, 60, 0, Math.PI * 2);
    g.arc(C, C, 42, 0, Math.PI * 2, true);
    g.clip('evenodd');
    g.fillStyle = '#f5c518';
    g.fillRect(0, 0, CELL_PX, CELL_PX);
    g.fillStyle = '#1b1b1f';
    for (let x = -CELL_PX; x < CELL_PX * 2; x += 28) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + 14, 0);
      g.lineTo(x + 14 + CELL_PX, CELL_PX);
      g.lineTo(x + CELL_PX, CELL_PX);
      g.fill();
    }
    g.restore();
  },
  chevrons(g) {
    rounded(g, 4, 40, 120, 48, 10, '#2b1d2a');
    label(g, '<<<<<<<', 65, 25, '#ff7a90');
  },
  skull(g) {
    // A cartoon skull with a bandage across the head: an "oops", never gore.
    blob(g, C, 56, 38, 36, '#f4f1ea');
    rounded(g, 42, 78, 44, 26, 8, '#f4f1ea');
    blob(g, 48, 56, 10, 11, '#2a2530');
    blob(g, 80, 56, 10, 11, '#2a2530');
    g.fillStyle = '#2a2530';
    g.beginPath();
    g.moveTo(C, 70);
    g.lineTo(C - 6, 82);
    g.lineTo(C + 6, 82);
    g.fill();
    for (const x of [54, 64, 74]) g.fillRect(x - 1, 88, 3, 12);
    g.save();
    g.translate(C, 34);
    g.rotate(-0.35);
    rounded(g, -50, -9, 100, 18, 4, '#f2c8a0');
    g.fillStyle = '#d99a6b';
    g.fillRect(-4, -9, 8, 18);
    g.restore();
    rounded(g, 100, 6, 24, 20, 8, '#fff'); // a tiny speech balloon: "!"
    label(g, '!', 17, 18, '#e0504a');
  },
  calendar(g) {
    rounded(g, 14, 16, 100, 100, 12, '#f6f7fb');
    g.fillStyle = '#e0504a';
    g.beginPath();
    g.roundRect(14, 16, 100, 30, [12, 12, 0, 0]);
    g.fill();
    label(g, 'FRI', 31, 20, '#fff');
    g.fillStyle = '#f5c518';
    g.beginPath();
    g.moveTo(C, 56);
    g.lineTo(C + 28, 106);
    g.lineTo(C - 28, 106);
    g.fill();
    label(g, '!', 90, 30, '#1b1b1f');
  },
  stamp(g) {
    g.save();
    g.translate(C, C);
    g.rotate(-0.14);
    stroke(g, '#3fbf6f', 8);
    g.strokeRect(-54, -26, 108, 52);
    g.fillStyle = 'rgba(63,191,111,0.14)';
    g.fillRect(-54, -26, 108, 52);
    g.restore();
    label(g, 'LGTM', 66, 34, '#3fbf6f');
  },
  sticker(g) {
    rounded(g, 8, 12, 112, 104, 10, '#ffe27a');
    label(g, 'WORKS', 38, 22, '#3b3322');
    label(g, 'ON MY', 66, 22, '#3b3322');
    label(g, 'MACHINE', 94, 20, '#3b3322');
  },
  bugsign(g) {
    rounded(g, 10, 30, 108, 68, 12, '#e0504a');
    label(g, 'BUG', 65, 38, '#fff');
  },
  featuresign(g) {
    rounded(g, 6, 30, 116, 68, 12, '#3fbf6f');
    label(g, 'FEATURE', 65, 22, '#fff');
  },
  root(g) {
    chip(g);
    label(g, '#', 56, 34, '#ff7a6b');
    label(g, 'root?', 80, 18, '#7dffa8');
  },
  pipe(g) {
    chip(g);
    label(g, 'curl | sh', 66, 20, '#7dffa8');
  },
  swirl(g) {
    // A time-machine swirl: a spiral of white (the effect tints it) with a soft core.
    stroke(g, '#fff', 9);
    g.beginPath();
    for (let a = 0; a <= Math.PI * 5; a += 0.12) {
      const r = 6 + a * 4.2;
      const x = C + Math.cos(a) * r;
      const y = C + Math.sin(a) * r;
      if (a === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.stroke();
    blob(g, C, C, 8, 8, '#fff');
  },
  sticky(g) {
    rounded(g, 14, 14, 100, 100, 6, '#ffe27a');
    rounded(g, 14, 14, 100, 18, 6, '#f5cf4d');
    label(g, 'TODO', 74, 24, '#3b3322');
  },
};
