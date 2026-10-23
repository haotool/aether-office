import { afterEach, expect, it, vi } from 'vitest';
import { print as controlPrint, say } from '../../apps/control/src/stdio.js';
import { print as runnerPrint, warn as runnerWarn } from '../../apps/runner/src/stdio.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('writes one line per call to stdout for output and to stderr for problems', () => {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  controlPrint('banner');
  runnerPrint('enrolled');
  runnerWarn('RUNNER_OFFLINE');
  expect(out.mock.calls.map(([text]) => text)).toEqual(['banner\n', 'enrolled\n']);
  expect(err.mock.calls.map(([text]) => text)).toEqual(['RUNNER_OFFLINE\n']);
});

it('reads the terminal locale as AETHER_LANG, LC_ALL, LC_MESSAGES, LANG; any zh locale gets zh-TW', () => {
  const pick = (env: Record<string, string>) => {
    for (const name of ['AETHER_LANG', 'LC_ALL', 'LC_MESSAGES', 'LANG'])
      vi.stubEnv(name, env[name] ?? '');
    return say('en', 'zh');
  };
  expect(pick({})).toBe('en');
  expect(pick({ LANG: 'C.UTF-8' })).toBe('en');
  expect(pick({ LANG: 'zh_TW.UTF-8' })).toBe('zh');
  expect(pick({ LANG: 'zh_CN.UTF-8' })).toBe('zh');
  expect(pick({ LANG: 'en_US.UTF-8', LC_MESSAGES: 'zh_TW.UTF-8' })).toBe('zh');
  expect(pick({ LC_ALL: 'en_US.UTF-8', LANG: 'zh_TW.UTF-8' })).toBe('en');
  expect(pick({ AETHER_LANG: 'en', LANG: 'zh_TW.UTF-8' })).toBe('en');
  expect(pick({ AETHER_LANG: 'zh-TW', LANG: 'C' })).toBe('zh');
});
