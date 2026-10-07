import { afterEach, expect, it, vi } from 'vitest';
import { print as controlPrint } from '../../apps/control/src/stdio.js';
import { print as runnerPrint, warn as runnerWarn } from '../../apps/runner/src/stdio.js';

afterEach(() => vi.restoreAllMocks());

it('writes one line per call to stdout for output and to stderr for problems', () => {
  const out = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  const err = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  controlPrint('banner');
  runnerPrint('enrolled');
  runnerWarn('RUNNER_OFFLINE');
  expect(out.mock.calls.map(([text]) => text)).toEqual(['banner\n', 'enrolled\n']);
  expect(err.mock.calls.map(([text]) => text)).toEqual(['RUNNER_OFFLINE\n']);
});
