import { expect, it } from 'vitest';
import { sessionCommands } from '../../apps/web/src/lib/sessions/localSessions.js';

it('builds each CLI’s own resume and fork commands, quoting the directory safely', () => {
  expect(sessionCommands({ provider: 'claude', sessionId: 'abc', cwd: "/tmp/it's here" })).toEqual({
    resume: "cd '/tmp/it'\\''s here' && claude --resume abc",
    fork: "cd '/tmp/it'\\''s here' && claude --resume abc --fork-session",
  });
  expect(sessionCommands({ provider: 'codex', sessionId: 'u-1', cwd: '/r' })).toEqual({
    resume: "cd '/r' && codex resume u-1",
    fork: "cd '/r' && codex fork u-1",
  });
});
