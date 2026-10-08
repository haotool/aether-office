import { hashText } from '../environment/hash.js';
import type { Rng } from '../environment/seeded.js';
import { viewRng } from './screen-seed.js';
import { generateFile } from './screen-codegen.js';
import { easeToward, readTarget } from './screen-motion.js';
import { lineText, type CodeLine } from './screen-tokens.js';
import { MONO, SANS, type ViewCtx } from './screen-theme.js';
import { fit, roundRect, text, textBars } from './screen-ui.js';

const URL_H = 30;
const MAX_DT = 400;

/** The address bar, with a progress line while the page is still loading. */
function drawUrlBar(c: ViewCtx, url: string): void {
  const { g, p, box } = c;
  g.fillStyle = p.panel;
  g.fillRect(box.x, box.y, box.w, URL_H);
  g.fillStyle = p.bg;
  roundRect(g, box.x + 56, box.y + 5, box.w - 72, 20, 10);
  g.fill();
  text(g, '‹  ›  ↻', box.x + 10, box.y + 19, p.dim, 13);
  g.font = `12px ${MONO}`;
  g.fillStyle = p.text;
  g.fillText(fit(g, url, box.w - 100), box.x + 70, box.y + 19);
  if (c.moving && c.elapsed < 4000) {
    g.fillStyle = c.accent; // the page is still loading
    g.fillRect(box.x, box.y + URL_H - 2, box.w * Math.min(0.92, c.elapsed / 4000), 2);
  }
}

/** The page body from `y0` down: a header band, a heading, sections of text bars with the odd code sample, a side column. */
function drawPage(c: ViewCtx, r: Rng, host: string, y0: number): void {
  const { g, p, box } = c;
  g.fillStyle = c.accent;
  g.globalAlpha = 0.18;
  g.fillRect(box.x, y0, box.w, 46);
  g.globalAlpha = 1;
  g.fillStyle = p.text;
  g.fillRect(box.x + 16, y0 + 16, 60 + (hashText(host) % 40), 12); // the site's name
  [0, 1, 2, 3].forEach((i) => g.fillRect(box.x + box.w - 190 + i * 44, y0 + 19, 30, 6));
  g.fillStyle = p.text;
  g.fillRect(box.x + 24, y0 + 66, box.w * (0.35 + r() * 0.3), 16); // a heading
  textBars(g, r, box.x + 24, y0 + 94, box.w * 0.62, 4, p.line);
  for (let section = 0; section < 5; section++) {
    const y = y0 + 168 + section * 118;
    g.fillStyle = p.dim;
    g.fillRect(box.x + 24, y, 90 + r() * 120, 9);
    textBars(g, r, box.x + 24, y + 18, box.w * 0.62, 3 + Math.floor(r() * 3), p.line);
    if (section % 2 === 0) {
      g.fillStyle = p.panel; // a code sample
      g.fillRect(box.x + 24, y + 62, box.w * 0.6, 34);
      g.fillStyle = c.accent;
      g.fillRect(box.x + 32, y + 70, 70 + r() * 80, 4);
      g.fillStyle = p.dim;
      g.fillRect(box.x + 32, y + 80, 100 + r() * 120, 4);
    }
  }
  g.fillStyle = p.panel; // a side column
  g.fillRect(box.x + box.w * 0.72, y0 + 66, box.w * 0.24, 200);
  textBars(g, r, box.x + box.w * 0.74, y0 + 80, box.w * 0.2, 9, p.line, 18);
}

/** A web page as a browser would show it: the host is the member's real target; the page is shapes, not text. */
export function drawBrowser(c: ViewCtx): void {
  const { g, p, box } = c;
  const target = c.work.target ?? '';
  const searching = c.work.tool === 'WebSearch' || /\s/.test(target);
  const host = searching || !target ? '' : (target.replace(/^https?:\/\//, '').split('/')[0] ?? '');
  const key = `${c.seed}:${host || target}`;
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  drawUrlBar(c, searching ? `search  ·  ${target}` : host ? `https://${host}` : 'about:blank');

  const targetScroll = readTarget(key, c.now, 220);
  c.state.scroll = c.moving
    ? easeToward(c.state.scroll, targetScroll, Math.min(c.dt, MAX_DT), 420)
    : targetScroll;
  const top = box.y + URL_H;
  g.save();
  g.beginPath();
  g.rect(box.x, top, box.w, box.h - URL_H);
  g.clip();
  drawPage(c, viewRng(c, host || target), host, top - c.state.scroll);
  g.restore();
}

/** One source line as the preview shows it, from `y` down: a heading, a bullet, a code fence gap or a paragraph line. Returns the next y. */
function drawPreviewLine(c: ViewCtx, line: CodeLine, raw: string, x: number, y: number): number {
  const { g, p, box } = c;
  const half = box.w / 2;
  if (raw.startsWith('# ')) {
    text(g, fit(g, raw.slice(2), half - 30), x, y + 6 + 8, p.text, 17, SANS, '700');
    return y + 6 + 24;
  }
  if (raw.startsWith('## ')) {
    text(g, fit(g, raw.slice(3), half - 30), x, y + 4 + 6, c.accent, 13, SANS, '700');
    return y + 4 + 18;
  }
  if (raw.startsWith('- ')) {
    g.fillStyle = c.accent;
    g.beginPath();
    g.arc(x + 3, y - 1, 2, 0, Math.PI * 2);
    g.fill();
    text(g, fit(g, raw.slice(2), half - 44), x + 12, y + 3, p.text, 11, SANS);
    return y + 15;
  }
  if (raw.startsWith('```') || line.tokens.length === 0) return y + 6;
  text(g, fit(g, raw, half - 30), x, y + 3, p.text, 11, SANS);
  return y + 15;
}

/** A markdown file: its source on the left, the page it makes on the right, both from made-up text under the real file name. */
export function drawDocs(c: ViewCtx): void {
  const { g, p, box } = c;
  const file = c.work.file ?? 'notes.md';
  const lines = generateFile(c.seed, file, 'md');
  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  const half = box.w / 2;
  g.fillStyle = p.panel;
  g.fillRect(box.x, box.y, box.w, 22);
  text(g, fit(g, `${file}   preview`, box.w - 16), box.x + 8, box.y + 15, p.text, 12);
  g.fillStyle = p.line;
  g.fillRect(box.x + half, box.y + 22, 1, box.h - 22);

  const maxScroll = Math.max(0, lines.length * 15 - (box.h - 22));
  const targetScroll = readTarget(`${c.seed}:${file}`, c.now, maxScroll * 0.8);
  c.state.scroll = c.moving
    ? easeToward(c.state.scroll, targetScroll, Math.min(c.dt, MAX_DT), 420)
    : targetScroll;
  g.save();
  g.beginPath();
  g.rect(box.x, box.y + 22, box.w, box.h - 22);
  g.clip();
  let y = box.y + 22 + 16 - c.state.scroll;
  lines.forEach((line, i) => {
    const raw = lineText(line);
    text(
      g,
      fit(g, raw, half - 20),
      box.x + 8,
      box.y + 22 + 14 + i * 15 - c.state.scroll,
      p.dim,
      10,
    );
    y = drawPreviewLine(c, line, raw, box.x + half + 14, y);
  });
  g.restore();
}
