import { CanvasTexture, SRGBColorSpace } from 'three';
import type { DepartmentId } from '@aether/kernel';
import { PALETTE, SCREEN_H, SCREEN_W, frame, label, tile } from './screens.js';

/**
 * What a member's own screen shows when the scene knows what the member is really doing: the session's title, where
 * it works, its state and the tool it is in, the context it has used. Every field is a fact read from the session;
 * a field that is not known is left out, never filled in.
 */
export type ScreenFacts = {
  provider: 'claude' | 'codex';
  title: string | null;
  repo: string;
  branch: string | null;
  /** Commits ahead of and behind upstream, and files not committed. */
  ahead: number;
  behind: number;
  uncommitted: number;
  model: string | null;
  /** Share of the context window in use, 0 to 100. */
  contextPercent: number | null;
  state: 'working' | 'idle' | 'waiting_permission' | 'offline' | 'unknown';
  /** The tool its last hook named. */
  tool: string | null;
  /** Whole minutes since anything happened in it. */
  quietMinutes: number | null;
  ports: readonly number[];
};

const MONO = 'ui-monospace, Menlo, monospace';
const SANS = '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", ui-sans-serif, sans-serif';
const STATE: Record<ScreenFacts['state'], { text: string; color: string }> = {
  working: { text: 'WORKING', color: PALETTE.green },
  idle: { text: 'IDLE', color: PALETTE.blue },
  waiting_permission: { text: 'WAITING FOR APPROVAL', color: PALETTE.amber },
  offline: { text: 'ENDED', color: PALETTE.dim },
  unknown: { text: '—', color: PALETTE.dim },
};
/** How each department's screen is dressed: a title for the work, and the ambient pattern drawn behind and beside the facts. */
export const SCREEN_THEME: Record<
  DepartmentId,
  { title: string; pattern: 'code' | 'pipeline' | 'checks' | 'chart' | 'board' }
> = {
  product: { title: 'BUILD', pattern: 'code' },
  platform: { title: 'PIPELINE', pattern: 'pipeline' },
  quality: { title: 'CHECKS', pattern: 'checks' },
  data: { title: 'ANALYSIS', pattern: 'chart' },
  leadership: { title: 'BOARD', pattern: 'board' },
};
/** Where the ambient column sits on a screen, as a share of its width: the stream that scrolls over it shares these. */
export const BAND = { from: 0.735, to: 0.985 } as const;
const MAX_TEXTURES = 48;
const cache = new Map<string, CanvasTexture>();

/** Text cut to a width with an ellipsis; one line. */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && g.measureText(`${text.slice(0, end)}…`).width > width) end--;
  return `${text.slice(0, end)}…`;
}

/** The title on up to two lines, the second cut with an ellipsis. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let rest = text;
  while (rest && lines.length < 2) {
    let end = rest.length;
    while (end > 1 && g.measureText(rest.slice(0, end)).width > width) end--;
    lines.push(rest.slice(0, end));
    rest = rest.slice(end);
  }
  if (rest) lines[1] = fit(g, `${lines[1]}${rest}`, width);
  return lines;
}

/** The pattern of a department's screen in its right-hand column. Abstract shapes, not data: what is real is the text. */
function ambient(g: CanvasRenderingContext2D, theme: DepartmentId, accent: string) {
  const x = SCREEN_W * BAND.from;
  const w = SCREEN_W * (BAND.to - BAND.from);
  g.save();
  g.globalAlpha = 0.5;
  g.strokeStyle = accent;
  g.fillStyle = accent;
  g.lineWidth = 2;
  const pattern = SCREEN_THEME[theme].pattern;
  for (let i = 0; i < 12; i++) {
    const y = 52 + i * 28;
    if (pattern === 'code')
      g.fillRect(x + (i % 3) * 10, y, w * (0.4 + ((i * 37) % 50) / 100) - (i % 3) * 10, 6);
    else if (pattern === 'pipeline') {
      g.strokeRect(x, y, w, 18);
      g.fillRect(x, y, w * (i % 4 === 3 ? 0.4 : 1), 18);
    } else if (pattern === 'checks') {
      g.strokeRect(x, y, 14, 14);
      if (i % 5 !== 4) g.fillRect(x + 3, y + 3, 8, 8);
      g.fillRect(x + 24, y + 4, w * (0.3 + ((i * 29) % 40) / 100), 6);
    } else if (pattern === 'chart')
      g.fillRect(
        x + (i % 2) * 4,
        y + 22 - ((i * 53) % 22),
        w - 8 - ((i * 17) % 40),
        22 - ((i * 53) % 22) + 4,
      );
    else {
      g.strokeRect(x + (i % 2) * (w / 2), y, w / 2 - 6, 20);
      if (i % 3 === 0) g.fillRect(x + (i % 2) * (w / 2), y, w / 2 - 6, 20);
    }
  }
  g.restore();
}

function draw(g: CanvasRenderingContext2D, f: ScreenFacts, accent: string, theme: DepartmentId) {
  frame(g, `${SCREEN_THEME[theme].title} · ${f.provider}`, accent);
  ambient(g, theme, accent);
  const left = 24;
  const width = SCREEN_W * BAND.from - left - 16;
  g.font = `600 26px ${SANS}`;
  g.fillStyle = PALETTE.text;
  wrap(g, f.title ?? f.repo, width).forEach((line, i) => g.fillText(line, left, 72 + i * 32));
  g.font = `20px ${MONO}`;
  g.fillStyle = accent;
  g.fillText(fit(g, f.branch ? `${f.repo} ⎇ ${f.branch}` : f.repo, width), left, 148);
  const chips = [
    f.ahead ? `↑${f.ahead}` : '',
    f.behind ? `↓${f.behind}` : '',
    f.uncommitted ? `● ${f.uncommitted} changed` : '',
  ].filter(Boolean);
  g.fillStyle = f.uncommitted ? PALETTE.amber : PALETTE.dim;
  g.fillText(chips.join('   ') || (f.branch ? 'clean' : ''), left, 176);
  g.fillStyle = PALETTE.line;
  g.fillRect(left, 192, width, 2);

  const state = STATE[f.state];
  g.fillStyle = state.color;
  g.beginPath();
  g.arc(left + 11, 226, 11, 0, Math.PI * 2);
  g.fill();
  g.font = `700 30px ${MONO}`;
  g.fillText(state.text, left + 34, 237);
  g.font = `22px ${MONO}`;
  if (f.tool) {
    g.fillStyle = accent;
    g.fillText(fit(g, `$ ${f.tool}${f.state === 'working' ? ' ▌' : ''}`, width), left, 276);
  }

  if (f.contextPercent !== null) {
    const percent = Math.max(0, Math.min(100, f.contextPercent));
    label(g, `CONTEXT  ${f.model ?? ''}`.trim(), left, 316, PALETTE.dim, 16);
    g.font = `16px ${MONO}`;
    g.textAlign = 'right';
    g.fillStyle = PALETTE.text;
    g.fillText(`${Math.round(percent)}%`, left + width, 316);
    g.textAlign = 'left';
    tile(g, left, 326, width, 16);
    g.fillStyle = percent >= 85 ? PALETTE.red : percent >= 60 ? PALETTE.amber : PALETTE.green;
    g.fillRect(left + 2, 328, ((width - 4) * percent) / 100, 12);
  } else if (f.model) label(g, f.model, left, 316, PALETTE.dim, 16);

  const footer = [
    f.quietMinutes === null ? '' : f.quietMinutes < 1 ? 'active now' : `quiet ${f.quietMinutes}m`,
    ...f.ports.slice(0, 3).map((p) => `:${p}`),
  ].filter(Boolean);
  if (footer.length) label(g, footer.join('  ·  '), left, 378, PALETTE.dim, 16);
}

/** The screen for what a member is really doing. Textures are cached by their facts and the oldest are let go. */
export function factsTexture(
  facts: ScreenFacts,
  accent: string,
  theme: DepartmentId,
): CanvasTexture {
  const key = JSON.stringify([facts, accent, theme]);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit); // most recently used last
    return hit;
  }
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const g = canvas.getContext('2d')!;
  draw(g, facts, accent, theme);
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let y = 0; y < SCREEN_H; y += 3) g.fillRect(0, y, SCREEN_W, 1);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  while (cache.size > MAX_TEXTURES) {
    const [oldest, old] = cache.entries().next().value!;
    cache.delete(oldest);
    old.dispose();
  }
  return texture;
}
