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
  isOrphaned,
  parseCpuTime,
  parseCwds,
  parseProcessList,
  parseProcessTable,
  parseStartTime,
  readProcessTable,
  ProcessNames,
  zombiesUnder,
  type AgentProcess,
  type ProcessRow,
} from '../../apps/control/src/services/runtime/agent-processes.js';
import './process-fixtures.js';
import { eventually } from './timing.js';

const UUID = '374456c6-9009-a172-ac17-4aa8f7535e70';

const ps = (
  pid: number,
  command: string,
  over: {
    ppid?: number;
    stat?: string;
    start?: string;
    time?: string;
    cpu?: number;
    rss?: number;
    tty?: string;
  } = {},
) =>
  `${over.start ?? 'Sat Oct  3 10:23:45 2026'} ${pid} ${over.ppid ?? 500} ${over.stat ?? 'S+'} ${over.time ?? '0:01.50'} ${over.cpu ?? 0} ${over.rss ?? 100} ${over.tty ?? 'ttys001'} ${command}`;
const agent = (over: Partial<AgentProcess>): AgentProcess => ({
  pid: 1,
  ppid: 500,
  provider: 'claude',
  cwd: '/x',
  resume: null,
  cpuPercent: 0,
  rssBytes: 0,
  startedAt: 0,
  cpuSeconds: 0,
  stat: 'S+',
  zombies: [],
  orphaned: false,
  ports: [],
  ...over,
});

it('reads start times, CPU times and whole ps lines in every form ps prints them', () => {
  expect(parseStartTime('Sat Oct  3 10:23:45 2026')).toBe(
    new Date(2026, 9, 3, 10, 23, 45).getTime(),
  );
  expect(parseStartTime('Mon Jan 12 00:00:01 2026')).toBe(new Date(2026, 0, 12, 0, 0, 1).getTime());
  expect(parseStartTime('garbage')).toBeNull();
  expect(parseCpuTime('0:01.50')).toBe(1.5);
  expect(parseCpuTime('12:34.00')).toBe(754);
  expect(parseCpuTime('1:02:03')).toBe(3723);
  expect(parseCpuTime('1-04:05:29')).toBe(86400 + 4 * 3600 + 5 * 60 + 29);
  const [row] = parseProcessTable(
    ps(77, '/bin/zsh -c echo "a  b"', { ppid: 5, stat: 'Ss', cpu: 3.5, rss: 2048, tty: '??' }),
  );
  expect(row).toMatchObject({
    pid: 77,
    ppid: 5,
    stat: 'Ss',
    cpuPercent: 3.5,
    rssBytes: 2048 * 1024,
    tty: '??',
  });
  expect(row!.command).toBe('/bin/zsh -c echo "a  b"');
  expect(parseProcessTable('not a ps line\n\n')).toEqual([]);
});

it('recognises provider CLI processes and ignores helpers that only share the name', () => {
  const found = parseProcessList(
    parseProcessTable(
      [
        ps(10, '/usr/local/bin/claude -p --resume ' + UUID + ' --agent x', { cpu: 1.5, rss: 2048 }),
        ps(
          11,
          '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex -c a=b app-server --x',
        ),
        ps(12, '/opt/homebrew/bin/codex exec -m gpt -C /work/repo prompt', {
          cpu: 30.2,
          rss: 4096,
        }),
        ps(13, '/opt/homebrew/Caskroom/codex/0.160.0/bin/codex-code-mode-host'),
        ps(
          14,
          '/Applications/ChatGPT.app/Contents/Frameworks/Codex Framework.framework/Helpers/Codex (Service) --type=utility',
        ),
        ps(15, '/bin/zsh -c source claude-snapshot.sh'),
      ].join('\n'),
    ),
  );
  expect(found.map((p) => [p.pid, p.provider, p.resume, p.cpuPercent, p.rssBytes, p.stat])).toEqual(
    [
      [10, 'claude', UUID, 1.5, 2048 * 1024, 'S+'],
      [12, 'codex', null, 30.2, 4096 * 1024, 'S+'],
    ],
  );
});

it('calls a process an orphan when whatever started it is gone, not merely when its ppid is small', () => {
  const rows = parseProcessTable(
    [
      ps(1, '/sbin/launchd', { ppid: 0, tty: '??' }),
      ps(100, '/bin/zsh', { ppid: 1, tty: 'ttys001' }),
      ps(200, 'claude', { ppid: 100 }),
      ps(201, 'claude -p', { ppid: 1, tty: '??' }),
      ps(202, 'claude -p', { ppid: 9999, tty: '??' }),
      ps(300, '/usr/lib/systemd/systemd --user', { ppid: 1 }),
      ps(301, 'claude -p', { ppid: 300, tty: '??' }),
      ps(302, 'claude', { ppid: 100, stat: 'Z' }),
      ps(303, 'claude', { ppid: 1, stat: 'Z' }),
    ].join('\n'),
  );
  const byPid = new Map<number, ProcessRow>(rows.map((r) => [r.pid, r]));
  const orphan = (pid: number) => isOrphaned(byPid.get(pid)!, byPid);
  expect([200, 201, 202, 301, 302, 303].map(orphan)).toEqual([
    false,
    true,
    true,
    true,
    false,
    false,
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
    agent({ pid: 1, cwd: '/elsewhere', resume: UUID }),
    agent({ pid: 2, cwd: '/b' }),
    agent({ pid: 3, cwd: '/b' }),
  ];
  const withDesktop = assignProcesses(sessions, processes, true);
  expect(Object.fromEntries([...withDesktop].map(([k, v]) => [k, v.state]))).toEqual({
    [`claude:${UUID}`]: 'running',
    'claude:newest': 'running',
    'claude:middle': 'running',
    'claude:oldest': 'none',
    'codex:desktop-thread': 'unknown',
    'codex:finished-exec': 'none',
  });
  expect(assignProcesses(sessions, processes, false).get('codex:desktop-thread')?.state).toBe(
    'none',
  );
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
    const found = await eventually(async () => {
      const { processes } = await listAgentProcesses();
      return processes.find((p) => p.pid === child.pid && p.cwd === work);
    });
    expect(found).toMatchObject({
      provider: 'claude',
      cwd: work,
    });
  } finally {
    child.kill();
  }
});

it('finds the ports an agent or its children listen on', () => {
  const rows = parseProcessTable(
    [
      ps(10, 'a', { ppid: 1 }),
      ps(20, 'b', { ppid: 10 }),
      ps(30, 'c', { ppid: 20 }),
      ps(40, 'd', { ppid: 1 }),
    ].join('\n'),
  );
  const tree = descendants(rows, [10]);
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

it('counts the zombies under each process, which is the only way to say whose they are', () => {
  const rows = parseProcessTable(
    [
      ps(100, 'claude', { ppid: 5 }),
      ps(101, '/bin/zsh -c build', { ppid: 100 }),
      ps(102, '<defunct>', { ppid: 100, stat: 'ZN' }),
      ps(103, '<defunct>', { ppid: 101, stat: 'Z' }),
      ps(104, '<defunct>', { ppid: 101, stat: 'Z' }),
      ps(200, 'codex', { ppid: 5 }),
      ps(300, '<defunct>', { ppid: 5, stat: 'Z' }),
    ].join('\n'),
  );
  expect(
    [...zombiesUnder(rows, [100, 200])].map(([root, list]) => [root, list.map((x) => x.pid)]),
  ).toEqual([[100, [102, 103, 104]]]);
});

it('sees a real zombie as <defunct> with no name or directory, and attributes it to the parent that never collected it', async () => {
  const bin = realpathSync(mkdtempSync(join(tmpdir(), 'aether-zombie-')));
  symlinkSync(process.execPath, join(bin, 'claude'));
  const parent = spawn(
    process.execPath,
    [
      '-e',
      `const {spawn}=require('node:child_process');spawn(${JSON.stringify(join(bin, 'claude'))},['-e','process.exit(0)'],{stdio:'ignore'});` +
        'Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,6000)',
    ],
    { stdio: 'ignore' },
  );
  try {
    await eventually(async () =>
      (await readProcessTable()).some((row) => row.ppid === parent.pid && row.stat.startsWith('Z')),
    );
    const table = await readProcessTable();
    const zombie = table.find((row) => row.ppid === parent.pid && row.stat.startsWith('Z'));
    expect(zombie).toBeDefined();
    expect(zombie!.command).not.toMatch(/claude/);
    expect(zombiesUnder(table, [parent.pid!]).get(parent.pid!)).toHaveLength(1);
  } finally {
    parent.kill();
  }
}, 20000);

it('remembers what a process under an agent was called, so a zombie can say what it was; never its arguments', () => {
  const live = parseProcessTable(
    [
      ps(100, 'claude --secret=hunter2', { ppid: 5 }),
      ps(102, '/usr/local/bin/node /work/build.js --token abc', { ppid: 100 }),
      ps(999, '/bin/zsh unrelated', { ppid: 5 }),
    ].join('\n'),
  );
  const names = new ProcessNames();
  names.remember(live, new Set([100, 102]));
  const dead = parseProcessTable(
    [
      ps(100, 'claude', { ppid: 5 }),
      ps(102, '<defunct>', { ppid: 100, stat: 'ZN' }),
      ps(999, '<defunct>', { ppid: 5, stat: 'Z' }),
    ].join('\n'),
  );
  names.remember(dead, new Set([100, 102, 999]));
  expect(names.programOf(dead[1]!)).toBe('node');
  expect(names.programOf(dead[2]!)).toBeNull();
  expect(JSON.stringify([...zombiesUnder(dead, [100], names)])).not.toMatch(
    /build\.js|token|hunter2/,
  );
  names.remember([], new Set());
  expect(names.programOf(dead[1]!)).toBeNull();
});
