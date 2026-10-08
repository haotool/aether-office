import { describe, expect, it } from 'vitest';
import { seeded } from '../../packages/office-scene/src/environment/seeded.js';
import * as art from '../../packages/office-scene/src/screen/screen-art-data.js';
import * as dev from '../../packages/office-scene/src/screen/screen-art-dev.js';
import * as plan from '../../packages/office-scene/src/screen/screen-art-plan.js';
import * as quality from '../../packages/office-scene/src/screen/screen-art-quality.js';
import {
  PALETTE,
  SCREEN_H,
  SCREEN_W,
  bars,
  codeLines,
  frame,
  label,
  lineChart,
  tile,
  type Draw,
} from '../../packages/office-scene/src/screen/screen-draw.js';
import { generateData } from '../../packages/office-scene/src/screen/screen-codegen-data.js';
import { lineText } from '../../packages/office-scene/src/screen/screen-tokens.js';
import { numbersOf, recordingContext, textsOf } from './fixtures/recording-canvas.js';

// Role screens are pictures drawn on a 640 x 400 canvas from a seeded random stream. There is no canvas here, so the context
// records the calls: what is checked is that each picture is complete (no NaN or infinite coordinate), repeatable for a member
// and different between members, and starts by painting the whole screen.
const DRAWS: [string, Draw][] = [
  ...Object.entries(art),
  ...Object.entries(dev),
  ...Object.entries(plan),
  ...Object.entries(quality),
].map(([name, draw]) => [name, draw as Draw]);
const run = (draw: Draw, seed: string, accent = '#43e6df') => {
  const { g, calls } = recordingContext();
  draw(g, seeded(seed), accent);
  return calls;
};

describe('role screen drawings', () => {
  it('cover data, dev, plan and quality screens', () => {
    expect(DRAWS.map(([name]) => name).sort()).toEqual(
      [
        'dataTables',
        'training',
        'kpis',
        'editor',
        'browserUi',
        'apiLogs',
        'phones',
        'pipeline',
        'monitoring',
        'releases',
        'architecture',
        'documents',
        'kanban',
        'mindmap',
        'tests',
        'security',
        'diff',
      ].sort(),
    );
  });

  it.each(DRAWS)('%s paints the whole screen first, then a titled picture', (_name, draw) => {
    const calls = run(draw, 'member-1');
    expect(calls.length).toBeGreaterThan(30);
    expect(calls[1]).toMatchObject({ op: 'fillRect', args: [0, 0, SCREEN_W, SCREEN_H] });
    expect(textsOf(calls)[0]!.length).toBeGreaterThan(3); // the window title
  });

  it.each(DRAWS)('%s uses only real numbers', (_name, draw) => {
    for (const seed of ['a', 'b', 'c', 'member-9'])
      expect(numbersOf(run(draw, seed)).every(Number.isFinite), seed).toBe(true);
  });

  it.each(DRAWS)('%s repeats for a member and varies between members', (_name, draw) => {
    expect(run(draw, 'member-1')).toEqual(run(draw, 'member-1'));
    expect(run(draw, 'member-1')).not.toEqual(run(draw, 'member-2'));
  });

  it.each(DRAWS)('%s takes the accent it is given', (_name, draw) => {
    const painted = run(draw, 'member-1', '#123456').filter(
      (c) => c.op === 'set fillStyle' || c.op === 'set strokeStyle',
    );
    expect(painted.some((c) => c.args[0] === '#123456')).toBe(true);
  });
});

describe('screen drawing primitives', () => {
  it('frame paints the background, a title bar with the accent line and three window dots', () => {
    const { g, calls } = recordingContext();
    frame(g, 'my title', '#ff00ff');
    expect(calls.filter((c) => c.op === 'fillRect')).toHaveLength(3);
    expect(calls.filter((c) => c.op === 'arc')).toHaveLength(3);
    expect(textsOf(calls)).toEqual(['my title']);
    const fills = calls.filter((c) => c.op === 'set fillStyle').map((c) => c.args[0]);
    expect(fills).toContain('#ff00ff');
    expect(fills.slice(0, 2)).toEqual([PALETTE.bg, PALETTE.panel]);
  });

  it('label sets colour, size and text', () => {
    const { g, calls } = recordingContext();
    label(g, 'hello', 10, 20, '#abcdef', 15);
    expect(calls).toContainEqual({ op: 'set font', args: ['15px ui-monospace, Menlo, monospace'] });
    expect(calls).toContainEqual({ op: 'fillText', args: ['hello', 10, 20] });
    expect(calls).toContainEqual({ op: 'set fillStyle', args: ['#abcdef'] });
  });

  it('tile fills a panel and strokes a half-pixel inset border in the accent', () => {
    const { g, calls } = recordingContext();
    tile(g, 10, 20, 100, 50, '#112233');
    expect(calls).toContainEqual({ op: 'strokeRect', args: [10.5, 20.5, 99, 49] });
    expect(calls).toContainEqual({ op: 'set strokeStyle', args: ['#112233'] });
    const plain = recordingContext();
    tile(plain.g, 0, 0, 10, 10);
    expect(plain.calls).toContainEqual({ op: 'set strokeStyle', args: [PALETTE.line] });
  });

  it('bars draws n bars that stay inside their box and reset the transparency', () => {
    const { g, calls } = recordingContext();
    bars(g, seeded('b'), 100, 50, 240, 80, '#fff', 6);
    const rects = calls.filter((c) => c.op === 'fillRect').map((c) => c.args as number[]);
    expect(rects).toHaveLength(6);
    for (const [x, y, w, h] of rects) {
      expect(x).toBeGreaterThanOrEqual(100);
      expect(y! + h!).toBeCloseTo(130);
      expect(h).toBeLessThanOrEqual(80);
      expect(w).toBeGreaterThan(0);
    }
    expect(calls.at(-1)).toEqual({ op: 'set globalAlpha', args: [1] });
  });

  it('lineChart keeps its line inside the chart box', () => {
    const { g, calls } = recordingContext();
    lineChart(g, seeded('l'), 20, 100, 300, 120, '#fff');
    const points = calls
      .filter((c) => c.op === 'lineTo' || c.op === 'moveTo')
      .map((c) => c.args as number[]);
    expect(points.length).toBeGreaterThan(40);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(20);
      expect(x).toBeLessThanOrEqual(320);
      expect(y).toBeGreaterThanOrEqual(100);
      expect(y).toBeLessThanOrEqual(220);
    }
  });

  it('codeLines numbers each row and keeps the coloured blocks inside the width', () => {
    const { g, calls } = recordingContext();
    codeLines(g, seeded('c'), 20, 40, 200, 5);
    expect(textsOf(calls).map((t) => t.trim())).toEqual(['1', '2', '3', '4', '5']);
    for (const [x, , w] of calls.filter((c) => c.op === 'fillRect').map((c) => c.args as number[]))
      expect(x! + w!).toBeLessThanOrEqual(220 + 0.001);
  });
});

describe('generated data files', () => {
  const names = (seed: string) => ({ stem: ['session', 'store'], r: seeded(seed) });

  it.each(['css', 'json', 'yaml', 'sql', 'sh', 'md'] as const)(
    '%s: enough lines, repeatable for a seed, different for another',
    (lang) => {
      const text = (seed: string) => generateData(lang, names(seed), 40).map(lineText).join('\n');
      expect(text('s1').split('\n').length).toBeGreaterThanOrEqual(20);
      expect(text('s1')).toBe(text('s1'));
      expect(text('s1')).not.toBe(text('s2'));
    },
  );

  it('writes JSON that opens and closes its braces, and SQL that ends its statements', () => {
    const json = generateData('json', names('j'), 60).map(lineText).join('\n');
    expect(json.split('{').length).toBe(json.split('}').length);
    const sql = generateData('sql', names('q'), 60).map(lineText).join('\n');
    expect(sql).toMatch(/;/);
  });
});
