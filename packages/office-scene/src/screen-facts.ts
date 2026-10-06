import { CanvasTexture, SRGBColorSpace } from 'three';
import type { DepartmentId } from '@aether/kernel';
import { PALETTE, SCREEN_H, SCREEN_W, frame, label, tile } from './screen-draw.js';
import { contextLevel } from './context.js';
import { drawMark } from './provider-marks.js';
import { hashText } from './random.js';
import { elapsedLabel, kindOf, type ToolCall } from './screen-work.js';

/**
 * What a member's own screen shows when the scene knows what the member is really doing: the session's title, where
 * it works, its state, its last tool calls (each drawn as the kind of work it is), the tool it is in, the context it has
 * used. Every field is a fact read from the session; a field that is not known is left out, never filled in.
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
  /** The tool its last hook named, and when that hook came (epoch ms). */
  tool: string | null;
  toolSince: number | null;
  /** The last tool calls, oldest first. */
  recent: readonly ToolCall[];
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
/** Where the ambient column sits on a screen, as a share of its width: the stream that scrolls over it shares these. */
export const BAND = { from: 0.735, to: 0.985 } as const;

const LEFT = 24;
const WIDTH = SCREEN_W * BAND.from - LEFT - 16;
const ROWS_TOP = 118;
const ROW_H = 26;
const ROWS_MAX = 8;

/** Text cut to a width with an ellipsis; one line. */
function fit(g: CanvasRenderingContext2D, text: string, width: number): string {
  if (g.measureText(text).width <= width) return text;
  let end = text.length;
  while (end > 1 && g.measureText(`${text.slice(0, end)}…`).width > width) end--;
  return `${text.slice(0, end)}…`;
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

/** The tab bar of an editor: the files its last edits touched, the newest one lit. */
function tabs(g: CanvasRenderingContext2D, recent: readonly ToolCall[], accent: string) {
  const names = [
    ...new Set(
      recent.flatMap((c) =>
        (kindOf(c) === 'edit' || kindOf(c) === 'read') && c.target ? [c.target] : [],
      ),
    ),
  ].slice(-3);
  const tabWidth = Math.min(136, (WIDTH - 8) / 3);
  g.font = `14px ${MONO}`;
  names.forEach((name, i) => {
    const x = LEFT + i * (tabWidth + 4);
    const active = i === names.length - 1;
    g.fillStyle = active ? PALETTE.panel : PALETTE.bg;
    g.fillRect(x, 88, tabWidth, 22);
    g.fillStyle = active ? accent : PALETTE.line;
    g.fillRect(x, active ? 88 : 108, tabWidth, 2);
    g.fillStyle = active ? PALETTE.text : PALETTE.dim;
    g.fillText(fit(g, name, tabWidth - 12), x + 6, 104);
  });
}

/** One tool call as the kind of work it is. `y` is the row's top; `live` says it is the call being run (cursor, marching bar). */
function row(
  g: CanvasRenderingContext2D,
  call: ToolCall,
  y: number,
  accent: string,
  live: boolean,
  blink: boolean,
) {
  const kind = kindOf(call);
  const name = call.target ?? call.tool;
  const h = hashText(name); // the same call always draws the same bars
  const base = y + 18;
  const cursor = live && blink ? ' ▌' : '';
  g.font = `17px ${MONO}`;
  if (kind === 'shell') {
    g.fillStyle = accent;
    g.fillText(fit(g, `$ ${name}${cursor}`, WIDTH), LEFT, base);
  } else if (kind === 'edit' || kind === 'read') {
    g.fillStyle = PALETTE.text;
    g.fillText(fit(g, `${kind === 'edit' ? '✎' : '▤'} ${name}${cursor}`, 250), LEFT, base);
    if (kind === 'edit') {
      g.fillStyle = PALETTE.red;
      g.fillRect(LEFT + 262, y + 4, 24 + (h % 90), 5);
      g.fillStyle = PALETTE.green;
      g.fillRect(LEFT + 262, y + 12, 24 + ((h >> 8) % 110), 5);
    }
  } else if (kind === 'git') {
    g.strokeStyle = PALETTE.violet;
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(LEFT + 8, y);
    g.lineTo(LEFT + 8, y + ROW_H);
    g.stroke();
    if (h % 3 === 0) {
      g.beginPath();
      g.moveTo(LEFT + 8, y + 13);
      g.lineTo(LEFT + 20, y + 4);
      g.stroke();
    }
    g.fillStyle = PALETTE.violet;
    g.beginPath();
    g.arc(LEFT + 8, y + 13, 5, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = PALETTE.text;
    g.fillText(fit(g, `${name}${cursor}`, WIDTH - 36), LEFT + 32, base);
  } else if (kind === 'test') {
    g.fillStyle = PALETTE.text;
    g.fillText(fit(g, `▸ ${name}${cursor}`, 190), LEFT, base);
    const x = LEFT + 202;
    const w = WIDTH - 202;
    tile(g, x, y + 4, w, 14);
    g.fillStyle = live ? PALETTE.amber : PALETTE.blue;
    // A finished run is a full bar (its outcome is not recorded); the live one is a segment that marches along.
    if (live) g.fillRect(x + 2 + (blink ? 0 : w / 2), y + 6, w / 2 - 4, 10);
    else g.fillRect(x + 2, y + 6, w - 4, 10);
  } else if (kind === 'search') {
    g.fillStyle = PALETTE.text;
    g.fillText(`⌕ ${call.tool}${cursor}`, LEFT, base);
    g.fillStyle = PALETTE.amber;
    for (let i = 0; i < 3; i++)
      g.fillRect(LEFT + 130, y + 3 + i * 7, 40 + ((h >> (i * 4)) % 120), 4);
  } else if (kind === 'web') {
    g.fillStyle = PALETTE.blue;
    g.fillText(fit(g, `§ ${name}${cursor}`, 250), LEFT, base);
    g.fillStyle = PALETTE.dim;
    for (let i = 0; i < 3; i++)
      g.fillRect(LEFT + 270 + (i ? 12 : 0), y + 3 + i * 7, 30 + ((h >> (i * 4)) % 90), 4);
  } else {
    g.fillStyle = PALETTE.dim;
    g.fillText(
      fit(g, `· ${call.tool}${call.target ? ` ${call.target}` : ''}${cursor}`, WIDTH),
      LEFT,
      base,
    );
  }
}

/** A dim lock screen: a session that is not doing anything shows no stream, only that it is there. */
function lock(g: CanvasRenderingContext2D, f: ScreenFacts) {
  g.fillStyle = 'rgba(6,16,25,0.62)';
  g.fillRect(0, 31, SCREEN_W, SCREEN_H - 31);
  const cx = SCREEN_W / 2;
  g.strokeStyle = PALETTE.dim;
  g.lineWidth = 4;
  g.beginPath();
  g.arc(cx, 156, 16, Math.PI, 0);
  g.stroke();
  g.fillStyle = PALETTE.dim;
  g.fillRect(cx - 24, 156, 48, 36);
  g.textAlign = 'center';
  g.font = `600 22px ${SANS}`;
  g.fillStyle = PALETTE.dim;
  g.fillText(fit(g, f.title ?? f.repo, SCREEN_W - 120), cx, 238);
  g.font = `18px ${MONO}`;
  const state = STATE[f.state].text;
  g.fillText(
    f.state === 'idle' && f.quietMinutes !== null ? `${state} · quiet ${f.quietMinutes}m` : state,
    cx,
    268,
  );
  if (f.contextPercent !== null) g.fillText(`context ${Math.round(f.contextPercent)}%`, cx, 294);
  g.textAlign = 'left';
}

/** What is being run now, and for how long: the footer's first words. */
function running(f: ScreenFacts, now: number): string {
  if (f.state === 'waiting_permission') return '⚠ approval needed';
  if (!f.tool) return f.state === 'working' ? 'thinking' : '';
  return `▶ ${f.tool}${f.toolSince === null ? '' : ` ${elapsedLabel(now - f.toolSince)}`}`;
}

function draw(
  g: CanvasRenderingContext2D,
  f: ScreenFacts,
  accent: string,
  theme: DepartmentId,
  now: number,
  blink: boolean,
) {
  frame(g, `${SCREEN_THEME[theme].title} · ${f.provider}`, accent);
  drawMark(g, f.provider, SCREEN_W - 30, 5, 20);
  if (f.state !== 'working' && f.state !== 'waiting_permission') return lock(g, f);
  ambient(g, theme, accent);

  g.font = `600 20px ${SANS}`;
  g.fillStyle = PALETTE.text;
  g.fillText(fit(g, f.title ?? f.repo, WIDTH), LEFT, 56);
  const chips = [
    f.branch ? `${f.repo} ⎇ ${f.branch}` : f.repo,
    f.ahead ? `↑${f.ahead}` : '',
    f.behind ? `↓${f.behind}` : '',
    f.uncommitted ? `● ${f.uncommitted}` : '',
  ].filter(Boolean);
  g.font = `15px ${MONO}`;
  g.fillStyle = accent;
  g.fillText(fit(g, chips.join('  '), WIDTH), LEFT, 80);
  tabs(g, f.recent, accent);

  // The last calls, the newest at the bottom; the one being run is the last when a tool is running.
  const calls = f.recent.slice(-ROWS_MAX);
  calls.forEach((call, i) => {
    const last = i === calls.length - 1;
    g.globalAlpha = 0.4 + (0.6 * (i + 1)) / calls.length;
    row(g, call, ROWS_TOP + i * ROW_H, accent, last && f.tool === call.tool, blink);
  });
  g.globalAlpha = 1;
  if (!calls.length) {
    g.font = `17px ${MONO}`;
    g.fillStyle = accent;
    g.fillText(`${f.tool ? `$ ${f.tool}` : 'working'}${blink ? ' ▌' : ''}`, LEFT, ROWS_TOP + 18);
  }

  g.fillStyle = PALETTE.line;
  g.fillRect(LEFT, 340, WIDTH, 2);
  const footer = [
    running(f, now),
    f.quietMinutes === null ? '' : f.quietMinutes < 1 ? 'active now' : `quiet ${f.quietMinutes}m`,
    ...f.ports.slice(0, 3).map((p) => `:${p}`),
  ].filter(Boolean);
  label(
    g,
    footer.join('  ·  '),
    LEFT,
    362,
    f.state === 'working' ? PALETTE.green : PALETTE.amber,
    16,
  );
  if (f.contextPercent !== null) {
    const percent = Math.max(0, Math.min(100, f.contextPercent));
    tile(g, LEFT, 374, WIDTH, 12);
    g.fillStyle = { calm: PALETTE.green, warm: PALETTE.amber, hot: PALETTE.red }[
      contextLevel(percent)
    ];
    g.fillRect(LEFT + 2, 376, ((WIDTH - 4) * percent) / 100, 8);
    label(g, `${Math.round(percent)}% ${f.model ?? ''}`.trim(), LEFT, 399, PALETTE.dim, 12);
  }
}

/**
 * One member's screen: a canvas drawn again only when its facts or its blink tick change, so the scene can call
 * `paint` every frame at no cost. Dispose the texture when the member leaves.
 */
export function createFactsScreen(accent: string, theme: DepartmentId) {
  const canvas = document.createElement('canvas');
  canvas.width = SCREEN_W;
  canvas.height = SCREEN_H;
  const g = canvas.getContext('2d')!;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  let drawn: ScreenFacts | null = null;
  let drawnTick = -1;
  return {
    texture,
    /** `tick` counts blink half-periods (a running screen redraws on each); a still screen ignores it. */
    paint(facts: ScreenFacts, tick: number, now: number) {
      const live = facts.state === 'working' || facts.state === 'waiting_permission';
      const step = live ? tick : 0;
      if (facts === drawn && step === drawnTick) return;
      drawn = facts;
      drawnTick = step;
      draw(g, facts, accent, theme, now, step % 2 === 0);
      g.fillStyle = 'rgba(255,255,255,0.035)';
      for (let y = 0; y < SCREEN_H; y += 3) g.fillRect(0, y, SCREEN_W, 1);
      texture.needsUpdate = true;
    },
  };
}
