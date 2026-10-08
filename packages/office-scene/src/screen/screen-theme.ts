import type { Chrome, DeskProfile, Theme } from '../desks/desk-profile.js';
import { SCREEN_H, SCREEN_W } from './screen-draw.js';
import type { TokenKind } from './screen-tokens.js';
import type { Work } from './screen-layout.js';
import type { ScreenFacts } from './screen-facts.js';
import { context2d } from '../core/canvas-2d.js';

export { SCREEN_H, SCREEN_W };
/** The title bar above and the footer below every view; a view draws in the box between them. */
export const BAR_H = 30;
export const FOOTER_Y = 346;
export const MONO = 'ui-monospace, Menlo, monospace';
export const SANS =
  '"PingFang TC", "Noto Sans TC", "Microsoft JhengHei", ui-sans-serif, sans-serif';

export type Palette = {
  bg: string;
  panel: string;
  line: string;
  text: string;
  dim: string;
  add: string;
  del: string;
  warn: string;
  info: string;
  /** The line the caret is on. */
  current: string;
  syntax: Record<TokenKind, string>;
};

export const PALETTES: Record<Theme, Palette> = {
  dark: {
    bg: '#061019',
    panel: '#0c1c28',
    line: '#1d3a4c',
    text: '#cfe8f0',
    dim: '#5f8496',
    add: '#3ee8a4',
    del: '#ff6b7d',
    warn: '#ffc65c',
    info: '#6aa8ff',
    current: 'rgba(106,168,255,0.12)',
    syntax: {
      kw: '#a592ff',
      id: '#cfe8f0',
      fn: '#6aa8ff',
      ty: '#3ee8d0',
      str: '#3ee8a4',
      num: '#ffc65c',
      com: '#5f8496',
      pun: '#8fb0c0',
      tx: '#cfe8f0',
    },
  },
  light: {
    bg: '#f3f6f8',
    panel: '#e1e8ed',
    line: '#c3cfd8',
    text: '#1c2b36',
    dim: '#6b8190',
    add: '#17995a',
    del: '#d23a4c',
    warn: '#b87400',
    info: '#1f6fe0',
    current: 'rgba(31,111,224,0.1)',
    syntax: {
      kw: '#6a3df0',
      id: '#1c2b36',
      fn: '#1f6fe0',
      ty: '#0a8f78',
      str: '#138a4e',
      num: '#b87400',
      com: '#8097a5',
      pun: '#546b7a',
      tx: '#1c2b36',
    },
  },
};

type Box = { x: number; y: number; w: number; h: number };

/** What a view keeps from one paint to the next: scrolling eases, so it needs to remember where it is. */
type ScreenState = { scroll: number; secondScroll: number };

export type ViewCtx = {
  g: CanvasRenderingContext2D;
  box: Box;
  p: Palette;
  accent: string;
  seed: string;
  /** Epoch ms of this paint. */
  now: number;
  /** Ms since the running tool began (0 when none is running): the clock typing and streaming run on. */
  elapsed: number;
  work: Work;
  facts: ScreenFacts;
  role: string;
  profile: DeskProfile;
  /** How much faster than its own pace the member types, 1 to 2. */
  speed: number;
  /** Ms since the last paint, for easing. */
  dt: number;
  state: ScreenState;
  /** False under reduced motion: views draw a still frame (no typing, no scrolling, no streaming). */
  moving: boolean;
};

export const CHROME_BAR: Record<
  Chrome,
  { buttons: 'left' | 'right' | 'none'; titleAlign: 'center' | 'left' }
> = {
  mac: { buttons: 'left', titleAlign: 'center' },
  win: { buttons: 'right', titleAlign: 'left' },
  flat: { buttons: 'none', titleAlign: 'left' },
};

const bars = new Map<string, HTMLCanvasElement>();

/** The title bar's own pixels (background, accent line, window buttons), drawn once per look and copied on every paint. */
export function chromeBar(chrome: Chrome, theme: Theme, accent: string): HTMLCanvasElement {
  const key = `${chrome}|${theme}|${accent}`;
  let bar = bars.get(key);
  if (bar) return bar;
  bar = document.createElement('canvas');
  bar.width = SCREEN_W;
  bar.height = BAR_H + 1;
  const g = context2d(bar);
  const p = PALETTES[theme];
  g.fillStyle = p.panel;
  g.fillRect(0, 0, SCREEN_W, BAR_H);
  g.fillStyle = accent;
  g.fillRect(0, BAR_H - 1, SCREEN_W, 2);
  const style = CHROME_BAR[chrome].buttons;
  if (style === 'left')
    [p.del, p.warn, p.add].forEach((c, i) => {
      g.fillStyle = c;
      g.beginPath();
      g.arc(16 + i * 16, 15, 5, 0, Math.PI * 2);
      g.fill();
    });
  else if (style === 'right') {
    g.strokeStyle = p.dim;
    g.lineWidth = 1.5;
    const x = SCREEN_W - 26;
    g.strokeRect(x - 26 + 0.5, 10.5, 9, 9);
    g.beginPath();
    g.moveTo(x - 52, 15);
    g.lineTo(x - 43, 15);
    g.moveTo(x - 4, 10);
    g.lineTo(x + 5, 20);
    g.moveTo(x + 5, 10);
    g.lineTo(x - 4, 20);
    g.stroke();
  }
  bars.set(key, bar);
  return bar;
}
