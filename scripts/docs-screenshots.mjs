// Documentation screenshots: starts a throwaway demo stack on synthetic data and photographs it with Playwright.
import { join } from 'node:path';
import { chromium } from '@playwright/test';
import { flag, only } from './docs-screenshots-config.mjs';
import { buildFixture, data } from './docs-screenshots-fixture.mjs';
import { startStack, stopStack, waitForHealth } from './docs-screenshots-stack.mjs';
import { SHOTS, base } from './docs-screenshots-shots.mjs';

const wanted = Object.keys(SHOTS).filter((id) => !only || only.includes(id));
if (flag('list')) {
  console.log(Object.keys(SHOTS).join('\n'));
  process.exit(0);
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    stopStack();
    process.exit(1);
  });
let browser;
try {
  buildFixture();
  startStack();
  await waitForHealth();
  browser = await chromium.launch({
    channel: 'chrome',
    args: flag('gpu') ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : [],
  });
  for (const id of wanted) await SHOTS[id](browser);
  if (flag('hold')) {
    console.log(`stack on ${base}, owner token in ${join(data, 'owner-token')} (Ctrl+C to stop)`);
    await new Promise(() => {});
  }
} finally {
  await browser?.close();
  stopStack();
}
