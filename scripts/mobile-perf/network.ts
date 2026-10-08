/**
 * Chrome DevTools Slow 4G preset (NetworkManager.ts Slow4GConditions, 2024).
 * @see https://github.com/ChromeDevTools/devtools-frontend/blob/main/front_end/core/sdk/NetworkManager.ts
 */
export const SLOW_4G_CDP = {
  offline: false,
  latency: 562.5,
  downloadThroughput: ((1.6 * 1_000_000) / 8) * 0.9,
  uploadThroughput: ((750 * 1_000) / 8) * 0.9,
};

import type { CDPSession } from '@playwright/test';

export async function applyNetworkProfile(cdp: CDPSession, profile: string) {
  if (profile !== 'slow-4g') return;
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', SLOW_4G_CDP);
}
