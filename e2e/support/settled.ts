import type { Locator, Page } from '@playwright/test';

/** Counted in frames, not milliseconds, so a loaded machine only makes it slower, never wrong. */
export function settled(element: Locator, quiet = 20) {
  return element.evaluate(
    (el, count) =>
      new Promise<void>((done) => {
        let last: DOMRect | null = null;
        let still = 0;
        const tick = () => {
          const box = el.getBoundingClientRect();
          const moved =
            !last ||
            [box.x - last.x, box.y - last.y, box.width - last.width, box.height - last.height].some(
              (d) => Math.abs(d) > 0.25,
            );
          still = moved ? 0 : still + 1;
          last = box;
          if (still >= count) done();
          else requestAnimationFrame(tick);
        };
        tick();
      }),
    quiet,
  );
}

export const frames = (page: Page, count: number) =>
  page.evaluate(
    (n) =>
      new Promise<void>((done) => {
        const tick = (left: number) =>
          left ? requestAnimationFrame(() => tick(left - 1)) : done();
        tick(n);
      }),
    count,
  );

/**
 * A negative wait made deterministic: `check` runs at the start of a window of `count` animation frames, every `step`
 * frames inside it and at its end, so something that shows up and goes again is caught too. It replaces a fixed sleep
 * followed by one look.
 */
export async function throughout(page: Page, check: () => Promise<void>, count: number, step = 30) {
  for (let left = count; left > 0; left -= step) {
    await check();
    await frames(page, Math.min(step, left));
  }
  await check();
}
