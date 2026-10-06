import { hashText, seeded } from './random.js';
import { fallbackLanguage, LANGUAGE_NAME } from './screen-lang.js';
import { generateFile } from './screen-codegen.js';
import { lineText, type CodeLine } from './screen-tokens.js';
import {
  caretOn,
  easeToward,
  editPosition,
  hunksOf,
  readTarget,
  typedChars,
  type EditAt,
} from './screen-motion.js';
import { kindOf } from './screen-work.js';
import { MONO, type ViewCtx } from './screen-theme.js';
import { fit, squiggle, text } from './screen-ui.js';

const TAB_H = 22;
const STATUS_H = 22;
const LH = 15;
const CW = 7.2;
const CODE_X = 44;
const MINIMAP_ROW = 3;
const MAX_DT = 400;
/** Where a still frame (reduced motion) leaves the typing: a few lines into the first hunk. */
const STILL_CHARS = 120;

/** The files the member's last edits and reads touched, oldest first, the open one last. */
function openFiles(c: ViewCtx, open: string): string[] {
  const names = c.facts.recent.flatMap((call) =>
    (kindOf(call) === 'edit' || kindOf(call) === 'read') && call.target ? [call.target] : [],
  );
  return [...new Set([...names.filter((n) => n !== open), open])].slice(-4);
}

/** One line's tokens, the first `limit` characters of it (after the indent): a line being typed shows only what is typed. */
function drawTokens(c: ViewCtx, line: CodeLine, x: number, y: number, limit = Infinity): void {
  const { g, p } = c;
  g.font = `12px ${MONO}`;
  let left = limit;
  let at = x + line.indent * 2 * CW;
  for (const [kind, s] of line.tokens) {
    if (left <= 0) break;
    const shown = s.length > left ? s.slice(0, left) : s;
    g.fillStyle = p.syntax[kind];
    g.fillText(shown, at, y);
    at += shown.length * CW;
    left -= shown.length;
  }
}

function drawTabs(c: ViewCtx, files: string[], open: string, dirty: boolean): void {
  const { g, p, box } = c;
  g.fillStyle = p.panel;
  g.fillRect(box.x, box.y, box.w, TAB_H);
  const width = Math.min(128, (box.w - 8) / Math.max(1, files.length));
  g.font = `12px ${MONO}`;
  files.forEach((name, i) => {
    const x = box.x + i * (width + 2);
    const active = name === open;
    g.fillStyle = active ? p.bg : p.panel;
    g.fillRect(x, box.y, width, TAB_H);
    g.fillStyle = active ? c.accent : p.line;
    g.fillRect(x, box.y + (active ? 0 : TAB_H - 2), width, 2);
    g.fillStyle = active ? p.text : p.dim;
    g.fillText(fit(g, name, width - 22), x + 8, box.y + 15);
    if (active && dirty) {
      g.fillStyle = p.warn;
      g.beginPath();
      g.arc(x + width - 10, box.y + 11, 3, 0, Math.PI * 2);
      g.fill();
    }
  });
}

function drawMinimap(
  c: ViewCtx,
  lines: readonly CodeLine[],
  top: number,
  height: number,
  hot: Set<number>,
): void {
  const { g, p, box } = c;
  const x = box.x + box.w + 6;
  g.globalAlpha = 0.55;
  lines.forEach((line, i) => {
    const y = top + i * MINIMAP_ROW;
    if (y > top + height - MINIMAP_ROW || line.tokens.length === 0) return;
    g.fillStyle = hot.has(i) ? p.add : p.syntax[line.tokens[0]![0]];
    g.globalAlpha = hot.has(i) ? 0.95 : 0.5;
    g.fillRect(x + line.indent * 1.2, y, Math.min(50, lineText(line).length * 0.6), 1.6);
  });
  g.globalAlpha = 1;
  const rows = height / LH;
  g.strokeStyle = c.accent;
  g.lineWidth = 1;
  g.strokeRect(x - 2.5, top + (c.state.scroll / LH) * MINIMAP_ROW + 0.5, 56, rows * MINIMAP_ROW);
}

function statusBar(
  c: ViewCtx,
  y: number,
  lang: string,
  at: { line: number; col: number } | null,
): void {
  const { g, p, box, facts } = c;
  g.fillStyle = c.accent;
  g.globalAlpha = 0.9;
  g.fillRect(box.x, y, box.w, STATUS_H);
  g.globalAlpha = 1;
  const ink = p.bg;
  g.font = `12px ${MONO}`;
  g.fillStyle = ink;
  const branch = facts.branch ? `⎇ ${facts.branch}${facts.uncommitted ? ' ●' : ''}` : '';
  g.fillText(fit(g, branch, 220), box.x + 8, y + 15);
  g.textAlign = 'right';
  g.fillText(
    `${at ? `Ln ${at.line + 1}, Col ${at.col + 1}   ` : ''}${lang}   UTF-8`,
    box.x + box.w - 8,
    y + 15,
  );
  g.textAlign = 'left';
}

/** An editor over the member's real file: tabs from the real recent files, code made up in the file's own language. */
export function drawEditor(c: ViewCtx): void {
  const { g, p, box } = c;
  const file = c.work.file ?? 'untitled';
  const lang = c.work.lang ?? fallbackLanguage(c.role, seeded(`${c.seed}:lang`));
  const lines = generateFile(c.seed, file, lang);
  const editing = c.work.kind === 'edit';
  const codeTop = box.y + TAB_H;
  const codeH = box.h - TAB_H - STATUS_H;

  g.fillStyle = p.bg;
  g.fillRect(box.x, box.y, box.w, box.h);
  drawTabs(c, openFiles(c, file), file, editing);

  const hunks = hunksOf(lines, c.seed, file);
  let at: EditAt | null = null;
  if (editing) {
    const toolStart = c.now - c.elapsed;
    const chars = c.moving
      ? typedChars(c.seed, c.elapsed, c.speed) + (hashText(`${toolStart}`) % 700)
      : STILL_CHARS;
    at = editPosition(lines, hunks, chars);
  }
  const maxScroll = Math.max(0, lines.length * LH - codeH);
  const target = at
    ? Math.min(maxScroll, Math.max(0, at.line * LH - codeH * 0.45))
    : readTarget(c.seed, c.now, maxScroll);
  c.state.scroll = c.moving ? easeToward(c.state.scroll, target, Math.min(c.dt, MAX_DT)) : target;

  const hot = new Set<number>();
  if (at) {
    const h = hunks[at.hunk]!;
    for (let i = h.start; i <= at.line; i++) hot.add(i);
  }
  g.save();
  g.beginPath();
  g.rect(box.x, codeTop, box.w, codeH);
  g.clip();
  const first = Math.floor(c.state.scroll / LH);
  for (let i = first; i < Math.min(lines.length, first + Math.ceil(codeH / LH) + 1); i++) {
    const y = codeTop + i * LH - c.state.scroll;
    const caretHere = at?.line === i;
    if (caretHere) {
      g.fillStyle = p.current;
      g.fillRect(box.x, y, box.w, LH);
    }
    const inHunk =
      at !== null &&
      hunks[at.hunk]!.start <= i &&
      i < hunks[at.hunk]!.start + hunks[at.hunk]!.length;
    if (inHunk && i > at!.line) continue; // not typed yet
    text(g, String(i + 1).padStart(3, ' '), box.x + 4, y + 11, caretHere ? p.text : p.dim, 11);
    if (hot.has(i)) {
      g.fillStyle = p.add;
      g.fillRect(box.x + 36, y + 1, 3, LH - 2);
    }
    drawTokens(
      c,
      lines[i]!,
      box.x + CODE_X,
      y + 11,
      caretHere ? Math.max(0, at!.column - lines[i]!.indent * 2) : Infinity,
    );
  }
  if (at) {
    const h = hunks[at.hunk]!;
    const redY = codeTop + h.start * LH - c.state.scroll;
    g.fillStyle = p.del;
    g.fillRect(box.x + 36, redY - 4, 3, 7); // lines taken out above the new ones
    if (seeded(`${c.seed}:${file}:wave:${at.hunk}`)() < 0.35 && at.line > h.start) {
      const prev = lines[at.line - 1]!;
      squiggle(
        g,
        box.x + CODE_X + (prev.indent * 2 + 4) * CW,
        codeTop + (at.line - 1) * LH - c.state.scroll + 14,
        36,
        p.del,
      );
    }
    if (!c.moving || caretOn(c.now)) {
      g.fillStyle = p.text;
      g.fillRect(
        box.x + CODE_X + at.column * CW,
        codeTop + at.line * LH - c.state.scroll + 1,
        2,
        LH - 2,
      );
    }
  }
  g.restore();
  drawMinimap(c, lines, codeTop, codeH, hot);
  statusBar(
    c,
    box.y + box.h - STATUS_H,
    LANGUAGE_NAME[lang],
    at ? { line: at.line, col: at.column } : null,
  );
}
