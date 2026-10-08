import { test, expect, type Page } from '@playwright/test';
import { signIn } from '../support/sign-in.js';

type Report = {
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  devicePixelRatio: number;
  quality: string;
  stats: { frames: number };
};

async function login(page: Page, path = '/') {
  await signIn(page, path);
}
const prefs = (value: string) => {
  window.localStorage.setItem(
    'aether-ui-preferences',
    JSON.stringify({
      state: { theme: 'dark', locale: 'zh-TW', quality: value, view: '3d', reducedMotion: false },
      version: 0,
    }),
  );
};
const reports = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __aetherPerfHistory?: unknown[] }).__aetherPerfHistory ?? [],
  ) as Promise<Report[]>;

test('without WebGL the office falls back to the 2D view and says so, instead of a blank scene', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...rest: unknown[]
    ) {
      return /webgl/i.test(type)
        ? null
        : (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
    } as typeof original;
    window.localStorage.setItem(
      'aether-ui-preferences',
      JSON.stringify({
        state: { theme: 'dark', locale: 'zh-TW', quality: 'balanced', view: '3d' },
        version: 0,
      }),
    );
  });
  await login(page);
  await expect(page.locator('.office-2d')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('3D 無法載入，已切換至完整列表。', { exact: true })).toBeVisible();
  await expect(page.locator('canvas')).toHaveCount(0);
});

test('quality levels change real resource use: low renders cheaper than high on the same scene', async ({
  browser,
}) => {
  const measure = async (quality: string) => {
    const context = await browser.newContext({ deviceScaleFactor: 2 });
    const page = await context.newPage();
    await page.addInitScript(prefs, quality);
    await login(page, '/?perf=1');
    await page.waitForFunction(
      () =>
        ((window as unknown as { __aetherPerfHistory?: unknown[] }).__aetherPerfHistory ?? [])
          .length > 0,
      undefined,
      { timeout: 30000 },
    );
    const [report] = await reports(page);
    await context.close();
    return report!;
  };
  const low = await measure('low');
  const high = await measure('high');
  expect(low.quality).toBe('low');
  expect(high.quality).toBe('high');
  expect(low.devicePixelRatio).toBe(1); // low never renders above 1x
  expect(high.devicePixelRatio).toBeGreaterThan(low.devicePixelRatio);
  expect(high.drawCalls).toBeGreaterThan(low.drawCalls); // the shadow pass only exists above low
});

test('entering and leaving the 3D scene repeatedly does not accumulate GPU geometry or textures', async ({
  page,
}) => {
  await page.addInitScript(prefs, 'balanced');
  await login(page, '/?perf=1');
  await page.waitForFunction(
    () =>
      ((window as unknown as { __aetherPerfHistory?: unknown[] }).__aetherPerfHistory ?? [])
        .length >= 1,
    undefined,
    { timeout: 30000 },
  );
  for (let round = 2; round <= 5; round++) {
    await page.getByRole('button', { name: '2D 列表', exact: true }).click();
    await expect(page.locator('canvas')).toHaveCount(0);
    await page.getByRole('button', { name: '3D 空間', exact: true }).click();
    await page.waitForFunction(
      (n) =>
        ((window as unknown as { __aetherPerfHistory?: unknown[] }).__aetherPerfHistory ?? [])
          .length >= n,
      round,
      { timeout: 30000 },
    );
  }
  const all = await reports(page);
  expect(all.length).toBeGreaterThanOrEqual(5);
  // What a mount holds varies by one or two with when data arrives relative to the sample, so the baseline is the
  // larger of the first two mounts. A leak grows round after round and still exceeds it.
  const baseline = {
    geometries: Math.max(all[0]!.geometries, all[1]!.geometries),
    textures: Math.max(all[0]!.textures, all[1]!.textures),
  };
  for (const later of all.slice(2)) {
    expect(later.geometries).toBeLessThanOrEqual(baseline.geometries);
    expect(later.textures).toBeLessThanOrEqual(baseline.textures);
  }
});
