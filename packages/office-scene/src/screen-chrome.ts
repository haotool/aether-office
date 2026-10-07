import type { DepartmentId } from '@aether/kernel';
import { contextLevel } from './context.js';
import { drawMark } from './provider-marks.js';
import { elapsedLabel } from './screen-work.js';
import {
  chromeBar,
  CHROME_BAR,
  FOOTER_Y,
  MONO,
  SANS,
  SCREEN_H,
  SCREEN_W,
  type ViewCtx,
} from './screen-theme.js';
import { fit, text } from './screen-ui.js';
import type { ViewId } from './screen-layout.js';
import { context2d } from './canvas-2d.js';

/** Where the ambient column sits on a screen, as a share of its width: the stream that scrolls over it shares these. */
export const BAND = { from: 0.89, to: 0.985 } as const;

/** How each department's screen is dressed: a title for the work, and the ambient pattern drawn in the column beside the view. */
const SCREEN_THEME: Record<
  DepartmentId,
  { title: string; pattern: 'code' | 'pipeline' | 'checks' | 'chart' | 'board' }
> = {
  product: { title: 'BUILD', pattern: 'code' },
  platform: { title: 'PIPELINE', pattern: 'pipeline' },
  quality: { title: 'CHECKS', pattern: 'checks' },
  data: { title: 'ANALYSIS', pattern: 'chart' },
  leadership: { title: 'BOARD', pattern: 'board' },
};

/** The pattern of a department's screen in its right-hand column. Abstract shapes, not data: what is real is the text. */
export function ambient(
  g: CanvasRenderingContext2D,
  department: DepartmentId,
  accent: string,
): void {
  const x = SCREEN_W * BAND.from + 4;
  const w = SCREEN_W * (BAND.to - BAND.from) - 4;
  g.save();
  g.globalAlpha = 0.5;
  g.strokeStyle = accent;
  g.fillStyle = accent;
  g.lineWidth = 2;
  const pattern = SCREEN_THEME[department].pattern;
  for (let i = 0; i < 11; i++) {
    const y = 40 + i * 28;
    if (pattern === 'code')
      g.fillRect(x + (i % 3) * 6, y, w * (0.4 + ((i * 37) % 50) / 100) - (i % 3) * 6, 6);
    else if (pattern === 'pipeline') {
      g.strokeRect(x, y, w, 18);
      g.fillRect(x, y, w * (i % 4 === 3 ? 0.4 : 1), 18);
    } else if (pattern === 'checks') {
      g.strokeRect(x, y, 12, 12);
      if (i % 5 !== 4) g.fillRect(x + 3, y + 3, 6, 6);
      g.fillRect(x + 18, y + 3, w * (0.3 + ((i * 29) % 40) / 100) - 18, 6);
    } else if (pattern === 'chart')
      g.fillRect(
        x + (i % 2) * 4,
        y + 22 - ((i * 53) % 22),
        w - 8 - ((i * 17) % 20),
        22 - ((i * 53) % 22) + 4,
      );
    else {
      g.strokeRect(x + (i % 2) * (w / 2), y, w / 2 - 4, 20);
      if (i % 3 === 0) g.fillRect(x + (i % 2) * (w / 2), y, w / 2 - 4, 20);
    }
  }
  g.restore();
}

/** The window's title: the real file, command or host where the view has one. */
export function viewTitle(view: ViewId, c: ViewCtx): string {
  const { work, facts } = c;
  switch (view) {
    case 'editor':
    case 'notebook':
    case 'docs':
      return `${work.file ?? 'untitled'} — ${facts.repo}`;
    case 'terminal':
    case 'tests':
      return `${facts.repo} — ${work.head ?? 'zsh'}`;
    case 'browser':
      return work.target ?? 'new tab';
    case 'git-graph':
    case 'git-diff':
      return `${facts.repo} · git`;
    case 'chat':
      return 'agents';
    case 'design':
      return 'canvas';
    case 'dashboard':
      return 'overview';
    case 'lock':
      return facts.repo;
  }
}

/** The title bar: window buttons (a look chosen per member), the title, the department and the provider's mark. */
export function drawTitleBar(c: ViewCtx, title: string, department: DepartmentId): void {
  const { g, p, profile } = c;
  g.drawImage(chromeBar(profile.chrome, profile.theme, c.accent), 0, 0);
  const style = CHROME_BAR[profile.chrome];
  const markX = style.buttons === 'right' ? SCREEN_W - 100 : SCREEN_W - 30;
  drawMark(g, c.facts.provider, markX, 5, 20);
  g.font = `600 13px ${MONO}`;
  g.fillStyle = p.text;
  if (style.titleAlign === 'center') {
    g.textAlign = 'center';
    g.fillText(fit(g, title, 380), SCREEN_W / 2, 20);
    g.textAlign = 'left';
  } else g.fillText(fit(g, title, 400), 14, 20);
  g.textAlign = 'right';
  g.font = `600 10px ${SANS}`;
  g.fillStyle = p.dim;
  g.fillText(SCREEN_THEME[department].title, markX - 8, 19);
  g.textAlign = 'left';
}

/** What is being run now, and for how long: the footer's first words. */
function running(c: ViewCtx): string {
  const { facts, now } = c;
  if (facts.state === 'waiting_permission') return '⚠ approval needed';
  if (!facts.tool) return facts.state === 'working' ? 'thinking' : '';
  return `▶ ${facts.tool}${facts.toolSince === null ? '' : ` ${elapsedLabel(now - facts.toolSince)}`}`;
}

/** The footer: the running tool with its clock, how long it has been quiet, the open ports, the context in use. All real. */
export function drawFooter(c: ViewCtx): void {
  const { g, p, facts } = c;
  g.fillStyle = p.bg;
  g.fillRect(0, FOOTER_Y - 2, SCREEN_W, SCREEN_H - FOOTER_Y + 2);
  g.fillStyle = p.line;
  g.fillRect(14, FOOTER_Y, SCREEN_W - 28, 2);
  const parts = [
    running(c),
    facts.quietMinutes === null
      ? ''
      : facts.quietMinutes < 1
        ? 'active now'
        : `quiet ${facts.quietMinutes}m`,
    ...facts.ports.slice(0, 3).map((port) => `:${port}`),
  ].filter(Boolean);
  g.font = `15px ${MONO}`;
  g.fillStyle = facts.state === 'working' ? p.add : p.warn;
  g.fillText(fit(g, parts.join('  ·  '), SCREEN_W - 28), 14, 366);
  if (facts.contextPercent === null) return;
  const percent = Math.max(0, Math.min(100, facts.contextPercent));
  g.fillStyle = p.panel;
  g.fillRect(14, 373, SCREEN_W - 28, 12);
  g.fillStyle = { calm: p.add, warm: p.warn, hot: p.del }[contextLevel(percent)];
  g.fillRect(16, 375, ((SCREEN_W - 32) * percent) / 100, 8);
  text(g, `${Math.round(percent)}% ${facts.model ?? ''}`.trim(), 14, 396, p.dim, 12);
}

let lines: HTMLCanvasElement | null = null;
/** A faint scanline overlay keeps a screen reading as a projection; drawn once, copied on every paint. */
export function drawScanlines(g: CanvasRenderingContext2D): void {
  if (!lines) {
    lines = document.createElement('canvas');
    lines.width = SCREEN_W;
    lines.height = SCREEN_H;
    const l = context2d(lines);
    l.fillStyle = 'rgba(255,255,255,0.035)';
    for (let y = 0; y < SCREEN_H; y += 3) l.fillRect(0, y, SCREEN_W, 1);
  }
  g.drawImage(lines, 0, 0);
}
