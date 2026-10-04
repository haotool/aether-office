import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import {
  assignProcesses,
  descendants,
  parseListening,
  listAgentProcesses,
  parseCwds,
  parseProcessList,
} from '../../apps/control/src/services/agent-processes.js';

const UUID = '374456c6-9009-4372-ac17-4aa8f7535e70';

it('recognises provider CLI processes and ignores helpers that only share the name', () => {
  const found = parseProcessList(
    [
      ' 10 1.5 2048 /usr/local/bin/claude -p --resume ' + UUID + ' --agent x',
      ' 11 0.0 100 /Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c a=b app-server --x',
      ' 12 30.2 4096 /opt/homebrew/bin/codex exec -m gpt -C /work/repo prompt',
      ' 13 0.1 10 /opt/homebrew/Caskroom/codex/0.160.0/bin/codex-code-mode-host',
      ' 14 0.0 10 /Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex (Service) --type=utility',
      ' 15 0.0 10 /bin/zsh -c source claude-snapshot.sh',
    ].join('\n'),
  );
  expect(found).toEqual([
    { pid: 10, provider: 'claude', resume: UUID, cpuPercent: 1.5, rssBytes: 2048 * 1024 },
    { pid: 12, provider: 'codex', resume: null, cpuPercent: 30.2, rssBytes: 4096 * 1024 },
  ]);
});

it('parses lsof field output into pid → directory', () => {
  expect(parseCwds('p10\nfcwd\nn/work/a b\np12\nfcwd\nn/work/c\n')).toEqual(
    new Map([
      [10, '/work/a b'],
      [12, '/work/c'],
    ]),
  );
});

it('names the session by --resume, otherwise gives N processes to the N newest sessions of that directory', () => {
  const s = (
    provider: 'claude' | 'codex',
    sessionId: string,
    cwd: string,
    mtime: number,
    shared = false,
  ) => ({ provider, sessionId, cwd, mtime, shared });
  const sessions = [
    s('claude', UUID, '/a', 1),
    s('claude', 'newest', '/b', 30),
    s('claude', 'middle', '/b', 20),
    s('claude', 'oldest', '/b', 10),
    s('codex', 'desktop-thread', '/c', 5, true),
    s('codex', 'finished-exec', '/d', 5),
  ];
  const processes = [
    {
      pid: 1,
      provider: 'claude' as const,
      cwd: '/elsewhere',
      resume: UUID,
      cpuPercent: 0,
      rssBytes: 0,
      ports: [],
    },
    {
      pid: 2,
      provider: 'claude' as const,
      cwd: '/b',
      resume: null,
      cpuPercent: 0,
      rssBytes: 0,
      ports: [],
    },
    {
      pid: 3,
      provider: 'claude' as const,
      cwd: '/b',
      resume: null,
      cpuPercent: 0,
      rssBytes: 0,
      ports: [],
    },
  ];
  const withDesktop = assignProcesses(sessions, processes, true);
  expect(Object.fromEntries([...withDesktop].map(([k, v]) => [k, v.state]))).toEqual({
    [`claude:${UUID}`]: 'running',
    'claude:newest': 'running',
    'claude:middle': 'running',
    'claude:oldest': 'none',
    'codex:desktop-thread': 'unknown', // inside the shared app server, not provably gone
    'codex:finished-exec': 'none', // its own process is gone
  });
  expect(assignProcesses(sessions, processes, false).get('codex:desktop-thread')?.state).toBe(
    'none',
  ); // no app server at all
});

it('finds a real running agent process and its working directory through ps and lsof', async () => {
  const bin = realpathSync(mkdtempSync(join(tmpdir(), 'aether-proc-')));
  const work = join(bin, 'work dir');
  mkdirSync(work);
  symlinkSync(process.execPath, join(bin, 'claude'));
  const child = spawn(join(bin, 'claude'), ['-e', 'setInterval(()=>{},1000)', '--', '-p'], {
    cwd: work,
    stdio: 'ignore',
  });
  try {
    await new Promise((r) => setTimeout(r, 400));
    const { processes } = await listAgentProcesses();
    expect(processes.find((p) => p.pid === child.pid)).toMatchObject({
      provider: 'claude',
      cwd: work,
    });
  } finally {
    child.kill();
  }
});

it('finds the ports an agent or its children listen on', () => {
  const tree = descendants(' 10 1\n 20 10\n 30 20\n 40 1\n', [10]);
  expect([...tree]).toEqual([
    [10, 10],
    [20, 10],
    [30, 10],
  ]);
  expect([...parseListening('p30\nf12\nn*:5173\nn127.0.0.1:5173\np20\nn[::1]:3000\n')]).toEqual([
    [30, [5173]],
    [20, [3000]],
  ]);
});
