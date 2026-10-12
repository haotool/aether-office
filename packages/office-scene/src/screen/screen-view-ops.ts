import { between, pick } from '../environment/pick.js';
import type { Rng } from '../environment/seeded.js';
import { viewRng } from './screen-seed.js';
import { VOCAB } from './screen-lang.js';
import { revealedLines, terminalOutput } from './screen-terminal-gen.js';
import { termContext } from './screen-view-terminal.js';
import { easeToward, readTarget } from './screen-motion.js';
import { MONO, type ViewCtx } from './screen-theme.js';
import { fit, polyline, text, wander } from './screen-ui.js';

const MAX_DT = 400;
const SPINNER = '◐◓◑◒';

/** A test runner: the command is real; the suites are made up, and a suite is "finished" or "running", never "passed" or "failed". */
export function drawTests(c: ViewCtx): void {
  const { g, p, box } = c;
  const r = viewRng(c, `${c.work.head}:suites`);
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  const running = c.facts.tool !== null;
  text(
    g,
    fit(g, `RUN  ${c.work.head ?? 'tests'}`, box.w - 40),
    box.x + 14,
    box.y + 22,
    c.accent,
    13,
    MONO,
    '700',
  );
  text(
    g,
    running ? (SPINNER[Math.floor(c.now / 200) % 4] ?? '') : '',
    box.x + box.w - 24,
    box.y + 22,
    p.text,
    14,
  );

  const total = 10;
  const arrived =
    running && c.moving
      ? Math.min(total, 1 + Math.floor(revealedLines(`${c.seed}:suites`, c.elapsed) / 2))
      : total;
  for (let i = 0; i < total; i++) {
    const name = `${pick(r, VOCAB.nouns)}-${pick(r, VOCAB.nouns)}.test.ts`;
    const width = between(r, 0.3, 1);
    const y = box.y + 40 + i * 25;
    if (i >= arrived) {
      text(g, '·', box.x + 14, y + 12, p.line, 14);
      text(g, name, box.x + 30, y + 12, p.line, 12);
    } else drawSuite(c, name, y, width, running && i === arrived - 1);
  }
}

function drawSuite(c: ViewCtx, name: string, y: number, width: number, active: boolean): void {
  const { g, p, box } = c;
  const barW = box.w - 250;
  text(g, active ? '▸' : '·', box.x + 14, y + 12, active ? c.accent : p.dim, 14);
  text(g, fit(g, name, 190), box.x + 30, y + 12, active ? p.text : p.dim, 12);
  g.fillStyle = p.panel;
  g.fillRect(box.x + 232, y + 3, barW, 11);
  g.fillStyle = active ? c.accent : p.info;
  g.globalAlpha = active ? 0.9 : 0.55;
  if (active) g.fillRect(box.x + 234 + ((c.now / 12) % (barW * 0.7)), y + 5, barW * 0.3, 7);
  else g.fillRect(box.x + 234, y + 5, (barW - 4) * width, 7);
  g.globalAlpha = 1;
}

const TILES = ['load', 'throughput', 'queue', 'memory', 'requests', 'cache'];

export function drawDashboard(c: ViewCtx): void {
  const { g, p, box } = c;
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  const shift = c.moving ? Math.floor(c.now / 900) : 0;
  const tileW = (box.w - 40) / 3;
  const tileH = (box.h - 70) / 2;
  TILES.forEach((name, i) => {
    const x = box.x + 10 + (i % 3) * (tileW + 10);
    const y = box.y + 38 + Math.floor(i / 3) * (tileH + 10);
    g.fillStyle = p.panel;
    g.fillRect(x, y, tileW, tileH);
    text(g, name, x + 8, y + 16, p.dim, 11);
    const values = wander(viewRng(c, `tile:${name}`), 28);
    polyline(g, values, x + 8, y + 26, tileW - 16, tileH - 38, i % 2 ? c.accent : p.info, shift);
  });
  text(g, 'overview', box.x + 12, box.y + 20, p.text, 13, MONO, '700');
  c.facts.ports.slice(0, 4).forEach((port, i) => {
    g.fillStyle = p.panel;
    g.fillRect(box.x + box.w - 200 + i * 48, box.y + 8, 44, 18);
    text(g, `:${port}`, box.x + box.w - 196 + i * 48, box.y + 21, c.accent, 11);
  });
}

const LANES = 3;

export function drawGitGraph(c: ViewCtx): void {
  const { g, p, box, facts } = c;
  const r = viewRng(c, 'graph');
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  text(
    g,
    fit(g, `⎇ ${facts.branch ?? 'HEAD'}`, 260),
    box.x + 14,
    box.y + 22,
    c.accent,
    14,
    MONO,
    '700',
  );
  const chips = [
    facts.ahead ? `↑${facts.ahead}` : '',
    facts.behind ? `↓${facts.behind}` : '',
    facts.uncommitted ? `● ${facts.uncommitted}` : '',
  ].filter(Boolean);
  text(g, chips.join('   '), box.x + 280, box.y + 22, p.warn, 13);
  for (let i = 0; i < 11; i++) drawCommit(c, r, i);
}

function drawCommit(c: ViewCtx, r: Rng, i: number): void {
  const { g, p, box, facts } = c;
  const y = box.y + 44 + i * 24;
  const lane = i % 5 === 3 ? 1 : i % 7 === 5 ? 2 : 0;
  g.strokeStyle = p.line;
  g.lineWidth = 2;
  for (let l = 0; l < LANES; l++) {
    if (l && i % 5 > 3) continue;
    g.beginPath();
    g.moveTo(box.x + 22 + l * 18, y - 12);
    g.lineTo(box.x + 22 + l * 18, y + 12);
    g.stroke();
  }
  g.fillStyle = i < facts.ahead ? c.accent : ([c.accent, p.info, p.warn][lane] ?? c.accent);
  g.beginPath();
  g.arc(box.x + 22 + lane * 18, y, 5, 0, Math.PI * 2);
  g.fill();
  const hash = Array.from({ length: 7 }, () => '0123456789abcdef'[Math.floor(r() * 16)]).join('');
  text(g, hash, box.x + 90, y + 4, p.dim, 12);
  text(
    g,
    `${pick(r, ['feat', 'fix', 'refactor', 'test'])}: ${pick(r, VOCAB.verbs)} ${pick(r, VOCAB.nouns)}`,
    box.x + 170,
    y + 4,
    i < facts.ahead ? p.text : p.dim,
    12,
  );
}

export function drawGitDiff(c: ViewCtx): void {
  const { g, p, box } = c;
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  const lines = terminalOutput(c.seed, 'git diff', termContext(c), 60);
  const maxScroll = Math.max(0, lines.length * 15 - box.h + 20);
  const target = readTarget(`${c.seed}:diff`, c.now, maxScroll * 0.6);
  c.state.scroll = c.moving
    ? easeToward(c.state.scroll, target, Math.min(c.dt, MAX_DT), 420)
    : target;
  g.save();
  g.beginPath();
  g.rect(box.x, box.y, box.w, box.h);
  g.clip();
  lines.forEach((l, i) => {
    const y = box.y + 12 + i * 15 - c.state.scroll;
    if (l.tone === 'add' || l.tone === 'del') {
      g.fillStyle = l.tone === 'add' ? p.add : p.del;
      g.globalAlpha = 0.14;
      g.fillRect(box.x, y - 2, box.w, 15);
      g.globalAlpha = 1;
    }
    const color = {
      text: p.text,
      dim: p.dim,
      add: p.add,
      del: p.del,
      warn: p.warn,
      accent: c.accent,
    }[l.tone];
    text(g, fit(g, l.text, box.w - 20), box.x + 10, y + 9, color, 12);
  });
  g.restore();
}
