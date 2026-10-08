import type { Browser } from '@playwright/test';
import { readTokenFile } from './env.ts';
import { enterOfficeAndWaitProbe, openMeasurePage } from './measure-page.ts';
import type { MeasureSettings } from './measure-types.ts';
import { metricsFromProbe, readHarnessSamples } from './measure-probe.ts';

export function profileSettings(profile: string): MeasureSettings {
  if (profile === 'M-LOW') {
    return {
      width: 390,
      height: 844,
      dpr: 3,
      throttle: 6,
      phone: true,
      network: 'slow-4g',
    };
  }
  if (profile === 'M-MID' || profile === 'M-LAB') {
    return { width: 390, height: 844, dpr: 3, throttle: 4, phone: true, network: 'none' };
  }
  throw new Error(`unsupported profile ${profile}`);
}

export async function measureCaseRound(
  browser: Browser,
  input: {
    baseUrl: string;
    tokenFile: string;
    frames: number;
    settings: MeasureSettings;
    quality: string;
  },
) {
  const { token } = readTokenFile(input.tokenFile);
  const session = await openMeasurePage(browser, input.settings, input.quality);
  await enterOfficeAndWaitProbe(session.page, input.baseUrl, input.frames, token);
  const samples = await readHarnessSamples(session.page);
  await session.context.close();
  if (!samples.probe) throw new Error('__aetherPerf missing after wait');
  const elapsedMin = (Date.now() - session.started) / 60_000;
  return metricsFromProbe(
    samples.probe,
    samples.longTasks,
    samples.apiCount,
    session.coldStartBytes,
    elapsedMin,
  );
}
