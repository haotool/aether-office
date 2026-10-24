import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { terminalOfClaudeSession } from '../../apps/control/src/services/terminals/terminal-link.js';

const SESSION = '25a4aa69-5520-4105-b0ad-f387f83fdeae';
const OTHER = 'eeaa7196-779e-4788-bb02-9f8dd4ac2a5b';
const STARTED = new Date(2026, 9, 23, 16, 51, 46).getTime();
const identity = (pid: number) => `${pid}:Fri Oct 23 16:51:46 2026`;

describe('terminalOfClaudeSession', () => {
  let home: string;
  const claude = (pid: number, sessionId: string) =>
    writeFileSync(
      join(home, '.claude/sessions', `${pid}.json`),
      JSON.stringify({ pid, sessionId, startedAt: STARTED + 1_500 }),
    );

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'aether-terminal-link-'));
    mkdirSync(join(home, '.claude/sessions'), { recursive: true });
  });

  it('picks the terminal whose own process wrote the session', async () => {
    claude(10, OTHER);
    claude(11, SESSION);
    const terminals = [
      { id: 'first', identity: identity(10) },
      { id: 'second', identity: identity(11) },
    ];
    expect(await terminalOfClaudeSession(home, SESSION, terminals)).toBe('second');
    expect(await terminalOfClaudeSession(home, OTHER, terminals)).toBe('first');
  });

  it('answers none for a session no AETHER terminal started', async () => {
    claude(10, OTHER);
    expect(
      await terminalOfClaudeSession(home, SESSION, [{ id: 'first', identity: identity(10) }]),
    ).toBeNull();
  });

  it('skips a terminal whose identity cannot be read', async () => {
    claude(11, SESSION);
    const terminals = [
      { id: 'broken', identity: 'not an identity' },
      { id: 'second', identity: identity(11) },
    ];
    expect(await terminalOfClaudeSession(home, SESSION, terminals)).toBe('second');
  });
});
