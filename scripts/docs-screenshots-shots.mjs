// The screenshots themselves: browser contexts, saving, and one function per picture.
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_BYTES, out, port } from './docs-screenshots-config.mjs';
import { data, home } from './docs-screenshots-fixture.mjs';

// ---- the shots ----------------------------------------------------------------------------------------------------------
export const base = `http://127.0.0.1:${port}`;
export const token = () => readFileSync(join(data, 'owner-token'), 'utf8').trim();
const DESKTOP = { width: 1440, height: 900 };
const PHONE = { width: 390, height: 844 };

/** A browser context already holding the preferences a person would have, signed in. */
async function open(
  browser,
  {
    size = DESKTOP,
    theme = 'dark',
    locale = 'en',
    url = '/office',
    prefs = {},
    touch = false,
    project = 'harbor-web',
  } = {},
) {
  const context = await browser.newContext({
    viewport: size,
    deviceScaleFactor: touch ? 2 : 1,
    hasTouch: touch,
    isMobile: touch,
    permissions: [],
    serviceWorkers: 'block',
  });
  const page = await context.newPage();
  await page.addInitScript(
    ([t, l, extra]) => {
      localStorage.setItem(
        'aether-ui-preferences',
        JSON.stringify({
          state: { theme: t, locale: l, view: '3d', autoCamera: false, ...extra },
          version: 0,
        }),
      );
      localStorage.setItem('aether-building-panel', 'closed');
    },
    [theme, locale, prefs],
  );
  await page.goto(`${base}${url}`);
  await page.getByLabel(/access token|存取權杖/i).fill(token());
  await page.getByRole('button', { name: /enter office|進入辦公室/i }).click();
  await page
    .locator(url.startsWith('/office') ? 'canvas' : 'main')
    .first()
    .waitFor({ timeout: 60_000 });
  if (project) {
    // The repositories of the fixture sessions are adopted as projects a moment after sign-in.
    const picker = page.locator('.project-picker select');
    await picker
      .locator('option', { hasText: project })
      .waitFor({ state: 'attached', timeout: 60_000 });
    await picker.selectOption({ label: project });
  }
  return { context, page };
}

/** Saves a JPEG, lowering the quality until it is small enough. */
async function save(page, id, options = {}) {
  mkdirSync(out, { recursive: true });
  const path = join(out, `${id}.jpg`);
  for (const quality of [82, 74, 66, 58, 50]) {
    await page.screenshot({ path, type: 'jpeg', quality, ...options });
    if (statSync(path).size <= MAX_BYTES) break;
  }
  console.log(`${id}.jpg  ${(statSync(path).size / 1024).toFixed(0)} KB`);
}

const settle = (page, ms = 6000) => page.waitForTimeout(ms);
const feedRow = (page, text) => page.locator('.feed-row', { hasText: text }).first();

/** The first-visit tour is the one place the whole spire and its crown are in frame; its caption is left out of the picture. */
const tour =
  (id, seconds, theme = 'dark') =>
  async (browser) => {
    const { context, page } = await open(browser, { url: '/office?intro=force', theme });
    await page.addStyleTag({ content: '.intro-caption{display:none!important}' });
    await page.waitForTimeout(seconds * 1000);
    await save(page, id);
    await context.close();
  };

export const SHOTS = {
  // The orbit at about 9 s shows the building, the spire and the crown at once; the rise at 43 s is the crown close up.
  'office-overview-desktop': tour('office-overview-desktop', 9),
  'office-overview-desktop-light': tour('office-overview-desktop-light', 9, 'light'),
  'office-crown-desktop': tour('office-crown-desktop', 43),
  'session-conversation-desktop': async (browser) => {
    const { context, page } = await open(browser);
    await settle(page, 4000);
    await feedRow(page, 'Checkout page redesign').click();
    await settle(page, 5000);
    await save(page, 'session-conversation-desktop');
    await context.close();
  },
};

SHOTS['kpi-dashboard-desktop'] = async (browser) => {
  const { context, page } = await open(browser);
  await settle(page, 8000);
  await page.getByRole('button', { name: 'Open the KPI dashboard' }).click();
  await settle(page, 2500);
  await save(page, 'kpi-dashboard-desktop');
  await context.close();
};
SHOTS['squad-strings-desktop'] = async (browser) => {
  const { context, page } = await open(browser, {
    url: '/office?squad=4&tools=900&look=1',
    prefs: { panelCollapsed: true },
  });
  await settle(page, 7000);
  await save(page, 'squad-strings-desktop');
  await context.close();
};
SHOTS['settings-office-desktop'] = async (browser) => {
  const { context, page } = await open(browser, { url: '/settings/office' });
  await settle(page, 2000);
  await save(page, 'settings-office-desktop');
  await context.close();
};
SHOTS['character-menu-desktop'] = async (browser) => {
  const { context, page } = await open(browser, { prefs: { panelCollapsed: false } });
  await settle(page, 4000);
  await feedRow(page, 'Deduplicate the event stream').click();
  const tag = page.locator('button.scene-label.selected');
  await tag.waitFor({ timeout: 15_000 });
  await page.waitForTimeout(3000);
  await tag.click(); // the feed row chose it; a second click on its name tag opens the menu
  await page.locator('.char-menu').waitFor({ timeout: 10_000 });
  await save(page, 'character-menu-desktop');
  await context.close();
};
SHOTS['connect-phone-desktop'] = async (browser) => {
  const { context, page } = await open(browser);
  await settle(page, 3000);
  await page.getByRole('button', { name: 'Open on your phone' }).first().click();
  await settle(page, 2500);
  await save(page, 'connect-phone-desktop');
  await context.close();
};
SHOTS['approval-card-desktop'] = async (browser) => {
  const { context, page } = await open(browser, { project: 'ledger-api' }); // opening the project adopts its repository
  // What switching it on in Settings does, as the owner: a cookie session and its CSRF token, then PUT /api/remote-approvals.
  const login = await fetch(`${base}/api/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: base },
    body: JSON.stringify({ token: token() }),
  });
  const { csrf } = await login.json();
  const cookie = login.headers
    .getSetCookie()
    .map((c) => c.split(';')[0])
    .join('; ');
  const on = await fetch(`${base}/api/remote-approvals`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: base, cookie, 'x-csrf-token': csrf },
    body: JSON.stringify({ enabled: true }),
  });
  if (!on.ok) throw new Error(`remote approvals not enabled: ${on.status}`);
  const hookToken = JSON.parse(readFileSync(join(home, '.aether/approvals.json'), 'utf8')).token;
  const id = 'c0ffee02-0002-4000-8000-000000000002';
  const posted = await fetch(`${base}/api/hook/permission-requests`, {
    method: 'POST',
    headers: { authorization: `Bearer ${hookToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      sessionId: id,
      cwd: join(home, 'repos/ledger-api'),
      tool: 'Bash',
      waitMs: 600_000,
      nonce: 'docsnonce0123456789',
      input: {
        command: 'pnpm test:integration',
        description: 'Run the integration suite against the sandbox database',
      },
      rules: ['Bash(pnpm test:integration:*)'],
    }),
  });
  if (!posted.ok) throw new Error(`permission request refused: ${posted.status}`);
  await settle(page, 6000);
  await save(page, 'approval-card-desktop');
  await context.close();
};
SHOTS['office-phone'] = async (browser) => {
  const { context, page } = await open(browser, { size: PHONE, touch: true });
  await settle(page, 9000);
  await save(page, 'office-phone');
  await context.close();
};
SHOTS['sessions-phone'] = async (browser) => {
  const { context, page } = await open(browser, { size: PHONE, touch: true });
  await settle(page, 6000);
  await page.touchscreen.tap(359, 735); // the chevron of the peek bar opens the sheet
  await settle(page, 2000);
  await save(page, 'sessions-phone');
  await page.getByText('Checkout page redesign').first().tap();
  await settle(page, 3000);
  await save(page, 'conversation-phone');
  await context.close();
};
