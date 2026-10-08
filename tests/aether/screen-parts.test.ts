import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { seeded } from '../../packages/office-scene/src/environment/seeded.js';
import { SCREEN_H, SCREEN_W } from '../../packages/office-scene/src/screen/screen-draw.js';
import { borrowCanvas, returnCanvas } from '../../packages/office-scene/src/screen/screen-pool.js';
import {
  BAR_H,
  CHROME_BAR,
  FOOTER_Y,
  PALETTES,
  chromeBar,
} from '../../packages/office-scene/src/screen/screen-theme.js';
import {
  fit,
  polyline,
  roundRect,
  squiggle,
  text,
  textBars,
  wander,
} from '../../packages/office-scene/src/screen/screen-ui.js';
import { installBrowserEnv, installGlobal, removeBrowserEnv } from './fixtures/browser-env.js';
import {
  numbersOf,
  recordingContext,
  textsOf,
  type DrawCall,
} from './fixtures/recording-canvas.js';

// Shared pieces of the desk screens, on a recording canvas (fixtures/recording-canvas.ts) and a `document` whose
// createElement hands out such canvases.
installBrowserEnv();
type FakeCanvas = {
  width: number;
  height: number;
  calls: DrawCall[];
  getContext: () => CanvasRenderingContext2D;
};
let made: FakeCanvas[];
beforeEach(() => {
  made = [];
  installGlobal('document', {
    createElement: () => {
      const { g, calls } = recordingContext();
      const canvas: FakeCanvas = { width: 0, height: 0, calls, getContext: () => g };
      made.push(canvas);
      return canvas;
    },
  });
});
afterAll(removeBrowserEnv);

describe('screen palettes', () => {
  const keys = (value: object) => Object.keys(value).sort();

  it('give the light and dark themes the same colours to paint with', () => {
    expect(keys(PALETTES.light)).toEqual(keys(PALETTES.dark));
    expect(keys(PALETTES.light.syntax)).toEqual(keys(PALETTES.dark.syntax));
  });

  it('are different themes, with text that stands out from the background', () => {
    expect(PALETTES.light.bg).not.toBe(PALETTES.dark.bg);
    const luminance = (hex: string) => {
      const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
      return 0.299 * r! + 0.587 * g! + 0.114 * b!;
    };
    expect(luminance(PALETTES.dark.bg)).toBeLessThan(luminance(PALETTES.dark.text) - 100);
    expect(luminance(PALETTES.light.bg)).toBeGreaterThan(luminance(PALETTES.light.text) + 100);
  });

  it('keep the bar and the footer inside the screen, with a view box between them', () => {
    expect(BAR_H).toBeLessThan(FOOTER_Y);
    expect(FOOTER_Y).toBeLessThan(SCREEN_H);
  });
});

describe('chromeBar', () => {
  const buttons = (calls: DrawCall[]) => ({
    dots: calls.filter((c) => c.op === 'arc').length,
    strokes: calls.filter((c) => c.op === 'strokeRect').length,
  });

  it('draws a Mac window with three dots on the left, once per look', () => {
    const bar = chromeBar('mac', 'dark', '#ff8800') as unknown as FakeCanvas;
    expect(bar.width).toBe(SCREEN_W);
    expect(bar.height).toBe(BAR_H + 1);
    expect(buttons(bar.calls)).toEqual({ dots: 3, strokes: 0 });
    expect(chromeBar('mac', 'dark', '#ff8800')).toBe(bar);
    expect(made).toHaveLength(1);
    expect(chromeBar('mac', 'dark', '#00ff88')).not.toBe(bar);
    expect(chromeBar('mac', 'light', '#ff8800')).not.toBe(bar);
  });

  it('draws a Windows window with its minimise, maximise and close marks on the right', () => {
    const bar = chromeBar('win', 'dark', '#ff8801') as unknown as FakeCanvas;
    expect(buttons(bar.calls)).toEqual({ dots: 0, strokes: 1 });
    expect(bar.calls.filter((c) => c.op === 'lineTo')).toHaveLength(3);
  });

  it('draws a flat window with no buttons, and always the accent line', () => {
    const bar = chromeBar('flat', 'light', '#ff8802') as unknown as FakeCanvas;
    expect(buttons(bar.calls)).toEqual({ dots: 0, strokes: 0 });
    expect(bar.calls).toContainEqual({ op: 'fillRect', args: [0, BAR_H - 1, SCREEN_W, 2] });
    expect(CHROME_BAR.flat.buttons).toBe('none');
  });
});

describe('scratch canvases', () => {
  it('lends a canvas sized and cleared for the borrower, and reuses a returned one', () => {
    const first = borrowCanvas(320, 200);
    expect([first.width, first.height]).toEqual([320, 200]);
    returnCanvas(first);
    const second = borrowCanvas(100, 50);
    expect(second).toBe(first);
    expect([second.width, second.height]).toEqual([100, 50]);
    expect(borrowCanvas(10, 10)).not.toBe(second);
  });

  it('keeps at most four spares', () => {
    const lent = Array.from({ length: 6 }, () => borrowCanvas(1, 1));
    lent.forEach(returnCanvas);
    const again = Array.from({ length: 6 }, () => borrowCanvas(1, 1));
    expect(again.filter((c) => lent.includes(c))).toHaveLength(4);
  });
});

describe('screen-ui helpers', () => {
  it('fit cuts text to a width with an ellipsis and leaves short text alone', () => {
    const { g } = recordingContext(); // a character is 7 wide
    expect(fit(g, 'short', 100)).toBe('short');
    const cut = fit(g, 'a very long file name.ts', 70);
    expect(cut.endsWith('…')).toBe(true);
    expect(cut.length * 7).toBeLessThanOrEqual(70);
    expect(cut.length).toBeGreaterThan(5);
    expect(fit(g, 'abcdefgh', 1)).toBe('a…'); // never shorter than one character
  });

  it('text sets the font, colour and words', () => {
    const { g, calls } = recordingContext();
    text(g, 'hi', 5, 6, '#123456', 14, 'serif', '600');
    expect(calls).toEqual([
      { op: 'set font', args: ['600 14px serif'] },
      { op: 'set fillStyle', args: ['#123456'] },
      { op: 'fillText', args: ['hi', 5, 6] },
    ]);
    const plain = recordingContext();
    text(plain.g, 'x', 0, 0, '#000');
    expect(plain.calls[0]!.args[0]).toMatch(/^12px /); // no stray space when there is no weight
  });

  it('roundRect starts a fresh path', () => {
    const { g, calls } = recordingContext();
    roundRect(g, 1, 2, 3, 4, 5);
    expect(calls).toEqual([
      { op: 'beginPath', args: [] },
      { op: 'roundRect', args: [1, 2, 3, 4, 5] },
    ]);
  });

  it('squiggle zigzags along the width', () => {
    const { g, calls } = recordingContext();
    squiggle(g, 10, 20, 12, '#f00');
    const ys = calls.filter((c) => c.op === 'lineTo').map((c) => (c.args as number[])[1]);
    expect(ys).toEqual([22, 20, 22, 20, 22, 20]);
  });

  it('wander makes a series that stays inside its band, the same for a seed', () => {
    const series = wander(seeded('w'), 30);
    expect(series).toHaveLength(30);
    expect(series.every((v) => v >= 0.05 && v <= 0.95)).toBe(true);
    expect(wander(seeded('w'), 30)).toEqual(series);
    expect(wander(seeded('v'), 30)).not.toEqual(series);
    expect(wander(seeded('w'), 0)).toEqual([]);
  });

  it('polyline spans its box and can scroll the series sideways', () => {
    const run = (shift: number) => {
      const { g, calls } = recordingContext();
      polyline(g, [0, 0.5, 1], 10, 20, 100, 40, '#0f0', shift);
      return calls
        .filter((c) => c.op === 'moveTo' || c.op === 'lineTo')
        .map((c) => c.args as number[]);
    };
    expect(run(0)).toEqual([
      [10, 60],
      [60, 40],
      [110, 20],
    ]);
    expect(run(1)).toEqual([
      [10, 40],
      [60, 20],
      [110, 60],
    ]);
  });

  it('textBars stand for lines of text with a short last line, inside the width', () => {
    const { g, calls } = recordingContext();
    textBars(g, seeded('t'), 10, 30, 200, 4, '#999');
    const widths = calls.filter((c) => c.op === 'fillRect').map((c) => (c.args as number[])[2]!);
    expect(widths).toHaveLength(4);
    expect(widths[3]!).toBeLessThanOrEqual(200 * 0.7);
    expect(Math.min(...widths.slice(0, 3))).toBeGreaterThanOrEqual(200 * 0.85);
    expect(numbersOf(calls).every(Number.isFinite)).toBe(true);
    expect(textsOf(calls)).toEqual([]);
  });
});
