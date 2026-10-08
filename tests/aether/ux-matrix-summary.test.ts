import { describe, expect, it } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const { CODE_PATHS, problems, summarize } = await import(
  pathToFileURL(resolve('scripts/ux-matrix-summary.mjs')).href
);

type Cell = {
  scene: string;
  viewport: string;
  theme: string;
  lang: string;
  overflowPx: number;
  blank: boolean;
  smallTargets: string[];
  axe: unknown[];
  errors: string[];
  expectsErrors?: boolean;
};

const cell = (scene: string, viewport: string, theme: string, lang: string): Cell => ({
  scene,
  viewport,
  theme,
  lang,
  overflowPx: 0,
  blank: false,
  smallTargets: [],
  axe: [],
  errors: [],
});

/** A complete, clean run: 7 widths x 2 themes x 2 languages of two scenes, and 4 combinations of two states. */
function cleanRun(): Cell[] {
  const cells: Cell[] = [];
  for (const [w, h] of [
    [320, 568],
    [360, 640],
    [390, 844],
    [820, 1180],
    [1180, 820],
    [1440, 900],
    [1920, 1080],
  ] as const)
    for (const theme of ['light', 'dark'])
      for (const lang of ['en', 'zh-TW'])
        for (const scene of ['login', 'office']) cells.push(cell(scene, `${w}x${h}`, theme, lang));
  for (const [theme, lang] of [
    ['dark', 'zh-TW'],
    ['light', 'en'],
  ] as const)
    for (const viewport of ['390x844', '820x1180'])
      for (const scene of ['state-error', 'state-offline'])
        cells.push(cell(scene, viewport, theme, lang));
  return cells;
}

const trees = Object.fromEntries(CODE_PATHS.map((p: string) => [p, `tree-${p}`]));
const stamped = (cells: Cell[]) => ({ trees, ...summarize(cells) });

describe('ux matrix summary', () => {
  it('counts a complete clean run as complete with nothing to fix', () => {
    const record = stamped(cleanRun());
    expect(record.core).toMatchObject({ cells: 56, combinations: 28, complete: true });
    expect(record.states).toMatchObject({ cells: 8, combinations: 4, complete: true });
    for (const rule of ['qa', 'axe', 'responsive'])
      expect(problems(record, trees, rule)).toEqual([]);
  });

  it('fails the rule that the broken cell belongs to', () => {
    const cells = cleanRun();
    cells[0]!.overflowPx = 12;
    cells[1]!.axe = [{ id: 'color-contrast' }];
    const record = stamped(cells);
    expect(problems(record, trees, 'qa')).toEqual(['core: 1 cells with overflow']);
    expect(problems(record, trees, 'axe')).toEqual(['core: 1 cells with axeSerious']);
    expect(problems(record, trees, 'responsive')).toEqual(['core: 1 cells with overflow']);
  });

  it('leaves out the errors a signed-out login and an injected failure are meant to cause', () => {
    const cells = cleanRun();
    cells[0]!.errors = ['Failed to load resource: 401 (Unauthorized)']; // a login cell
    const injected = cells.find((c) => c.scene === 'state-error')!;
    injected.errors = ['Failed to load resource: 500'];
    injected.expectsErrors = true;
    expect(problems(stamped(cells), trees, 'qa')).toEqual([]);
    cells[2]!.errors = ['TypeError: x is undefined']; // a login cell with a real error
    expect(problems(stamped(cells), trees, 'qa')).toEqual(['core: 1 cells with unexpectedErrors']);
  });

  it('is incomplete when a combination is missing or short of a scene', () => {
    const missing = cleanRun().filter((c) => c.viewport !== '320x568');
    expect(problems(stamped(missing), trees, 'qa')).toEqual(['core matrix incomplete']);
    const short = cleanRun().filter((_, i) => i !== 5);
    expect(problems(stamped(short), trees, 'qa')).toEqual(['core matrix incomplete']);
  });

  it('is stale once the code it describes has a different tree id', () => {
    const record = stamped(cleanRun());
    expect(problems(record, { ...trees, 'apps/web': 'changed' }, 'qa')).toEqual([
      'record is stale for apps/web',
    ]);
    expect(problems(null, trees, 'qa')[0]).toMatch(/^no docs\/verification\/ux-matrix\.json/);
  });
});
