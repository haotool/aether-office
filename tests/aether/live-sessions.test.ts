import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  encodeRoot,
  resetDiscoveryCache,
  sessionsOfProcesses,
} from '../../apps/control/src/services/session-discovery.js';
import {
  MAX_SESSIONS,
  resetLocalSessionCache,
  scanLocalSessions,
} from '../../apps/control/src/services/local-sessions.js';
import type { AgentProcess } from '../../apps/control/src/services/agent-processes.js';

const DAY = 86400_000;
const UUID = '374456c6-9009-4372-ac17-4aa8f7535e70';
const session = (file: string, cwd: string, ageMs: number) => {
  writeFileSync(file, `${JSON.stringify({ type: 'user', cwd })}\n`);
  const when = new Date(Date.now() - ageMs);
  utimesSync(file, when, when);
};
const agent = (over: Partial<AgentProcess>): AgentProcess => ({
  pid: 1,
  ppid: 5,
  provider: 'claude',
  cwd: '/x',
  resume: null,
  cpuPercent: 0,
  rssBytes: 0,
  startedAt: 0,
  cpuSeconds: 0,
  stat: 'S',
  zombies: [],
  orphaned: false,
  ports: [],
  ...over,
});

it('finds the old session a live process owns: by --resume wherever it began, or from its directory', async () => {
  const home = mkdtempSync(join(tmpdir(), 'aether-live-'));
  const projects = join(home, '.claude/projects');
  const here = join(projects, encodeRoot('/work/here'));
  const elsewhere = join(projects, encodeRoot('/work/began-elsewhere'));
  mkdirSync(here, { recursive: true });
  mkdirSync(elsewhere, { recursive: true });
  session(join(here, 'old-a.jsonl'), '/work/here', 20 * DAY);
  session(join(here, 'old-b.jsonl'), '/work/here', 30 * DAY);
  session(join(here, 'older.jsonl'), '/work/here', 90 * DAY);
  session(join(elsewhere, `${UUID}.jsonl`), '/work/began-elsewhere', 25 * DAY);
  resetDiscoveryCache();
  const byId = await sessionsOfProcesses(
    home,
    [agent({ resume: UUID, cwd: '/work/here' })],
    new Set(),
  );
  expect(byId.map((r) => [r.sessionId, r.cwd])).toEqual([[UUID, '/work/began-elsewhere']]);
  const byDirectory = await sessionsOfProcesses(home, [agent({ cwd: '/work/here' })], new Set());
  expect(byDirectory.map((r) => r.sessionId)).toEqual(['old-a']); // one process, the newest file of its folder
  const two = await sessionsOfProcesses(
    home,
    [agent({ cwd: '/work/here' }), agent({ pid: 2, cwd: '/work/here' })],
    new Set(),
  );
  expect(two.map((r) => r.sessionId)).toEqual(['old-a', 'old-b']);
  const skipsKnown = await sessionsOfProcesses(
    home,
    [agent({ cwd: '/work/here' })],
    new Set([join(here, 'old-a.jsonl')]),
  );
  expect(skipsKnown.map((r) => r.sessionId)).toEqual(['old-b']); // what is already known is not found twice
  expect(await sessionsOfProcesses(home, [agent({ cwd: '/nowhere' })], new Set())).toEqual([]);
});

it('shows a live session even when it is older than a week and far past the newest sixty', async () => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), 'aether-live-')));
  const bin = join(home, 'bin');
  const work = join(home, 'work dir');
  mkdirSync(bin);
  mkdirSync(work);
  symlinkSync(process.execPath, join(bin, 'claude'));
  const projects = join(home, '.claude/projects');
  const crowd = join(projects, 'crowd');
  const own = join(projects, encodeRoot(work));
  mkdirSync(crowd, { recursive: true });
  mkdirSync(own, { recursive: true });
  for (let n = 0; n < MAX_SESSIONS + 15; n++)
    session(join(crowd, `s${n}.jsonl`), '/elsewhere', n * 60_000);
  session(join(own, 'quiet.jsonl'), work, 12 * DAY); // older than the recent window
  const child = spawn(join(bin, 'claude'), ['-e', 'setInterval(()=>{},1000)', '--', '-p'], {
    cwd: work,
    stdio: 'ignore',
  });
  try {
    await new Promise((r) => setTimeout(r, 500));
    resetLocalSessionCache();
    const sessions = await scanLocalSessions(home, Date.now(), 0, join(home, 'no-hooks.jsonl'));
    const mine = sessions.find((s) => s.sessionId === 'quiet');
    expect(mine).toMatchObject({ process: 'running', cwd: work });
    // The transcript is twelve days old, but the process began a moment ago: how quiet a session has been is never
    // counted from before its process lived, so a fresh launch is active, not dormant.
    expect(mine!.liveness.state).toBe('active');
    expect(mine!.liveness.startedAt).toBeGreaterThan(Date.now() - 60_000);
    expect(sessions.filter((s) => s.process !== 'running')).toHaveLength(MAX_SESSIONS); // the cap is for the rest
  } finally {
    child.kill();
  }
}, 30000);
