import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { claudeSessionOf } from '../../apps/control/src/services/runtime/claude-process-sessions.js';

const SESSION = '25a4aa69-5520-4105-b0ad-f387f83fdeae';
const STARTED = 1_792_745_000_000;

describe('claudeSessionOf', () => {
  let home: string;
  const write = (pid: number, body: unknown) =>
    writeFileSync(join(home, '.claude/sessions', `${pid}.json`), JSON.stringify(body));

  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'aether-claude-home-'));
    mkdirSync(join(home, '.claude/sessions'), { recursive: true });
  });

  it('names the session a process wrote for itself', async () => {
    write(10, { pid: 10, sessionId: SESSION, startedAt: STARTED + 1_800 });
    expect(await claudeSessionOf(home, { pid: 10, startedAt: STARTED })).toBe(SESSION);
  });

  it('ignores a file left by an earlier process that had the same pid', async () => {
    write(10, { pid: 10, sessionId: SESSION, startedAt: STARTED - 60_000 });
    expect(await claudeSessionOf(home, { pid: 10, startedAt: STARTED })).toBeNull();
  });

  it('ignores a file that names another pid', async () => {
    write(10, { pid: 11, sessionId: SESSION, startedAt: STARTED + 1_000 });
    expect(await claudeSessionOf(home, { pid: 10, startedAt: STARTED })).toBeNull();
  });

  it('ignores a session id that is not a UUID', async () => {
    write(10, { pid: 10, sessionId: '../../etc/passwd', startedAt: STARTED + 1_000 });
    expect(await claudeSessionOf(home, { pid: 10, startedAt: STARTED })).toBeNull();
  });

  it('returns null when there is no file or it is not JSON', async () => {
    expect(await claudeSessionOf(home, { pid: 10, startedAt: STARTED })).toBeNull();
    writeFileSync(join(home, '.claude/sessions/10.json'), 'not json');
    expect(await claudeSessionOf(home, { pid: 10, startedAt: STARTED })).toBeNull();
  });
});
