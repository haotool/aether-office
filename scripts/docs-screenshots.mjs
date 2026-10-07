// Documentation screenshots: starts a throwaway demo stack on synthetic data and photographs it with Playwright.
//
//   node --import tsx scripts/docs-screenshots.mjs --port 4511 --out docs/images [--only id,id] [--list] [--gpu] [--hold]
//
// Everything on screen comes from a fixture home built here: invented repositories, authors and conversations, fake
// `claude` processes (`sleep`, named claude, standing in each repository) and hook records. Nothing is read from your
// ~/.claude or ~/.codex, no model is called, and the stack and its data directory are removed afterwards. Only the PIDs this
// script started are signalled. The LAN address in the pairing QR code is a stand-in (`192.168.1.20`).
// `--gpu` uses the real GPU (ANGLE Metal); without it Chrome renders in software, which is slower but identical in content.
// `--hold` keeps the stack up after the shots (Ctrl+C to stop) so a page can be looked at by hand.
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
