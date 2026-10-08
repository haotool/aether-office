import { test, expect, type Page } from '@playwright/test';
import { signIn as signInTo } from '../support/sign-in.js';
import { throughout } from '../support/settled.js';

// The installable app: manifest, iOS and theme meta tags, safe areas, the install offer, and the service worker
// (registered only in a secure context, never storing API answers, asking before it updates). 127.0.0.1 is a secure
// context, like localhost; a phone on http://192.168.x.x is not, which the unit tests cover (tests/aether/pwa.test.ts).
async function signIn(page: Page) {
  await signInTo(page);
  await expect(page.locator('main')).toBeVisible();
}

test.describe('manifest and meta', () => {
  test('the manifest is complete and every file it names exists', async ({ request }) => {
    const manifest = (await (await request.get('/manifest.webmanifest')).json()) as {
      id: string;
      scope: string;
      start_url: string;
      display: string;
      display_override: string[];
      lang: string;
      description: string;
      categories: string[];
      icons: { src: string; sizes: string; purpose: string }[];
      shortcuts: { name: string; url: string; icons: { src: string }[] }[];
    };
    expect(manifest).toMatchObject({
      id: '/',
      scope: '/',
      start_url: '/',
      display: 'standalone',
      lang: 'zh-Hant',
    });
    expect(manifest.display_override).toEqual(['standalone', 'minimal-ui']);
    expect(manifest.description).not.toBe('');
    expect(manifest.categories.length).toBeGreaterThan(0);
    for (const purpose of ['any', 'maskable'])
      for (const sizes of ['192x192', '512x512'])
        expect(
          manifest.icons.some((i) => i.purpose === purpose && i.sizes === sizes),
          `${purpose} ${sizes}`,
        ).toBe(true);
    expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/sessions', '/approvals']);
    const files = [
      ...manifest.icons.map((i) => i.src),
      ...manifest.shortcuts.flatMap((s) => s.icons.map((i) => i.src)),
    ];
    for (const src of files) expect((await request.get(src)).ok(), src).toBe(true);
    for (const shortcut of manifest.shortcuts)
      expect((await request.get(shortcut.url)).ok(), shortcut.url).toBe(true);
  });

  test('the page declares the iOS web app, the viewport and a theme color per scheme', async ({
    page,
  }) => {
    await page.goto('/');
    const meta = (selector: string) => page.locator(selector).getAttribute('content');
    expect(await meta('meta[name="viewport"]')).toContain('viewport-fit=cover');
    expect(await meta('meta[name="apple-mobile-web-app-capable"]')).toBe('yes');
    expect(await meta('meta[name="apple-mobile-web-app-status-bar-style"]')).toBe(
      'black-translucent',
    );
    expect(await meta('meta[name="apple-mobile-web-app-title"]')).not.toBe('');
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
      'href',
      '/apple-touch-icon.png',
    );
    await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
      'href',
      '/manifest.webmanifest',
    );
    await expect(page.locator('meta[name="theme-color"][media*="dark"]')).toHaveCount(1);
    await expect(page.locator('meta[name="theme-color"][media*="light"]')).toHaveCount(1);
  });

  test('the theme color follows the theme chosen in the app', async ({ page }) => {
    await signIn(page);
    for (const theme of ['light', 'dark'] as const) {
      await page.evaluate((value) => {
        const store = JSON.parse(localStorage.getItem('aether-ui-preferences') ?? '{}') as {
          state?: object;
        };
        localStorage.setItem(
          'aether-ui-preferences',
          JSON.stringify({ ...store, state: { ...store.state, theme: value } }),
        );
      }, theme);
      await page.reload();
      await expect(page.locator('main')).toBeVisible();
      const [surface, colors] = await page.evaluate(() => [
        getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
        [...document.querySelectorAll('meta[name="theme-color"]')].map((m) =>
          m.getAttribute('content'),
        ),
      ]);
      expect(colors, theme).toEqual([surface, surface]);
    }
  });
});

test.describe('phone hygiene', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('safe areas, no pull-to-refresh, and fields that iOS does not zoom into', async ({
    page,
  }) => {
    await page.goto('/');
    // computed values resolve to 0px without a notch, so look for the insets in the stylesheet itself
    const css = await page.evaluate(async () => {
      const href = document.querySelector('link[rel=stylesheet]')!.getAttribute('href')!;
      return (await fetch(href)).text();
    });
    for (const side of ['top', 'bottom', 'left', 'right'])
      expect(css).toContain(`env(safe-area-inset-${side}`);
    for (const used of ['--safe-bottom', '--safe-top'])
      expect(css.split(`var(${used})`).length, used).toBeGreaterThan(3);
    const root = await page.evaluate(() => ({
      overscroll: getComputedStyle(document.body).overscrollBehaviorY,
    }));
    expect(root.overscroll).toBe('none');
    const small = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'input:not([type=checkbox]):not([type=radio]), textarea, select',
        ),
      ]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((size) => size < 16),
    );
    expect(small).toEqual([]);
    await signIn(page);
    await page.goto('/settings');
    await expect(page.locator('main')).toBeVisible();
    const settings = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          'main input:not([type=checkbox]):not([type=radio]), main textarea, main select',
        ),
      ]
        .filter((el) => (el as HTMLElement).offsetParent !== null)
        .map((el) => parseFloat(getComputedStyle(el).fontSize))
        .filter((size) => size < 16),
    );
    expect(settings).toEqual([]);
  });
});

test.describe('install offer', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('Chromium: the install button appears when the browser offers it, and a dismissal is remembered', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // The browser fires this on its own; stand in for it with the same shape, the moment the page starts listening.
      const listen = window.addEventListener.bind(window);
      window.addEventListener = ((...args: Parameters<typeof listen>) => {
        listen(...args);
        if (args[0] !== 'beforeinstallprompt') return;
        const offer = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
          prompt: () => Promise.resolve(),
        });
        Object.assign(window, { offer });
        queueMicrotask(() => window.dispatchEvent(offer));
      }) as typeof window.addEventListener;
    });
    await signIn(page);
    await expect(page.getByText('把 AETHER 安裝到這台裝置。')).toBeVisible();
    await expect(page.getByRole('button', { name: '安裝', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '關閉', exact: true }).first().click();
    await expect(page.getByText('把 AETHER 安裝到這台裝置。')).toHaveCount(0);
    await page.reload();
    // The page has taken the new offer (it calls preventDefault) and had its frames to act on it.
    await page.waitForFunction(
      () => (window as unknown as { offer?: Event }).offer?.defaultPrevented,
    );
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
    await expect(page.getByText('把 AETHER 安裝到這台裝置。')).toHaveCount(0);
  });

  test('Chromium: no offer, no banner', async ({ page }) => {
    await signIn(page);
    // Nothing is offered, so there is nothing to wait for: the banner must not appear in the frames that follow.
    await throughout(
      page,
      async () => {
        await expect(page.getByText('把 AETHER 安裝到這台裝置。')).toHaveCount(0);
        await expect(page.getByText(/加入主畫面/)).toHaveCount(0);
      },
      72,
    );
  });
});

test.describe('install hint on iOS Safari', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  });

  test('shows the Share steps once, until dismissed', async ({ page }) => {
    await signIn(page);
    await expect(page.getByText('安裝方式：點選「分享」，再選「加入主畫面」。')).toBeVisible();
    await page.getByRole('button', { name: '關閉', exact: true }).first().click();
    await page.reload();
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByText(/加入主畫面/)).toHaveCount(0);
  });
});

test.describe('service worker', () => {
  test.use({ serviceWorkers: 'allow' });

  const controlled = (page: Page) =>
    page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.active?.state ?? null;
    });

  test('registers on a secure page, keeps the shell, never an API answer, and the kill switch removes it', async ({
    page,
  }) => {
    await signIn(page);
    expect(await page.evaluate(() => window.isSecureContext)).toBe(true);
    await expect.poll(() => controlled(page), { timeout: 15000 }).toBe('activated');
    // use the API, then look at everything the worker has stored
    await page.evaluate(() => fetch('/api/projects').then((r) => r.text()));
    const stored = await page.evaluate(async () => {
      const urls: string[] = [];
      for (const name of await caches.keys())
        for (const request of await (await caches.open(name)).keys())
          urls.push(`${name} ${new URL(request.url).pathname}`);
      return urls;
    });
    expect(stored.length).toBeGreaterThan(2);
    expect(stored.every((entry) => entry.startsWith('aether-shell-'))).toBe(true);
    expect(stored.some((entry) => entry.endsWith(' /index.html'))).toBe(true);
    expect(stored.some((entry) => /\/assets\/index-[\w-]{8}\.js$/.test(entry))).toBe(true);
    expect(stored.filter((entry) => /\/api\/|\.glb/.test(entry))).toEqual([]);

    await page.goto('/?sw=off');
    await expect
      .poll(
        () => page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
        { timeout: 10000 },
      )
      .toBe(0);
    expect(await page.evaluate(async () => (await caches.keys()).length)).toBe(0);
    await page.goto('/?sw=on'); // leave the origin as the next test expects it
  });

  test('a new version waits for the person: a toast, then a reload that takes it', async ({
    page,
  }) => {
    await signIn(page);
    await expect.poll(() => controlled(page), { timeout: 15000 }).toBe('activated');
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    // a second script URL stands in for a rebuilt server's changed sw.js: the same worker under another address
    await page.evaluate(() => navigator.serviceWorker.register('/sw.js?v=2'));
    await expect(page.getByText('有新版本可用。')).toBeVisible({ timeout: 15000 });
    expect(
      await page.evaluate(() => navigator.serviceWorker.controller?.scriptURL.endsWith('?v=2')),
    ).toBe(false);
    await page.getByRole('button', { name: '重新載入', exact: true }).click();
    await expect
      .poll(
        () =>
          page.evaluate(() => navigator.serviceWorker.controller?.scriptURL ?? '').catch(() => ''), // the page is reloading: ask again once it is back
        { timeout: 15000 },
      )
      .toContain('/sw.js?v=2');
    await expect(page.getByText('有新版本可用。')).toHaveCount(0);
  });

  test('an open page still finds a chunk the server no longer has (a rebuild)', async ({
    page,
  }) => {
    await signIn(page);
    await expect.poll(() => controlled(page), { timeout: 15000 }).toBe('activated');
    await page.reload(); // now under the worker's control
    await expect(page.locator('main')).toBeVisible();
    // the old version's chunk is in the cache; the rebuilt server has never heard of it
    const old = '/assets/Retired-AbCd1234.js';
    const kept = await page.evaluate(async (url) => {
      const [name] = (await caches.keys()).filter((n) => n.startsWith('aether-shell-'));
      await (
        await caches.open(name!)
      ).put(
        url,
        new Response('export default 1', { headers: { 'content-type': 'text/javascript' } }),
      );
      const answer = await fetch(url);
      return [answer.status, await answer.text()];
    }, old);
    expect(kept).toEqual([200, 'export default 1']);
    expect((await page.request.get(old)).status()).toBe(404); // the server really lacks it
    await page.goto('/?sw=off');
    await page.goto('/?sw=on');
  });
});
