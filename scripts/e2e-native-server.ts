/** Synthetic-only browser fixture. Never invokes an installed provider binary. */
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { setup } from './setup.js';
import { Control } from '../apps/control/src/control.js';
const directory = mkdtempSync(join(tmpdir(), 'aether-synthetic-browser-'));
const repository = join(directory, 'fixture-repository');
execFileSync('git', ['init', '-q', repository]);
writeFileSync(join(repository, 'fixture.txt'), 'synthetic browser evidence');
execFileSync('git', ['-C', repository, 'add', 'fixture.txt']);
execFileSync('git', [
  '-C',
  repository,
  '-c',
  'user.name=Fixture',
  '-c',
  'user.email=fixture@example.invalid',
  'commit',
  '-qm',
  'synthetic fixture',
]);
setup('live', directory);
const control = new Control(join(directory, 'control.sqlite'), { mode: 'live' });
const owner = control.authenticate(readFileSync(join(directory, 'owner-token'), 'utf8').trim());
const execute = (type: string, data: unknown, projectId?: string, expectedVersion?: number) =>
  control.execute(owner, {
    schemaVersion: 1,
    type,
    data,
    idempotencyKey: randomUUID(),
    correlationId: randomUUID(),
    ...(projectId ? { projectId } : {}),
    ...(expectedVersion === undefined ? {} : { expectedVersion }),
  });
const projectId = String(
  execute('project.create', { name: 'Synthetic browser fixture · 無模型', root: repository })
    .result['id'],
);
execute(
  'agent.register',
  {
    name: 'Synthetic Codex Wire',
    provider: 'codex',
    role: 'Engineer',
    species: 'fox',
    color: '#71c5ca',
  },
  projectId,
);
execute(
  'agent.register',
  {
    name: 'Synthetic Reviewer Wire',
    provider: 'codex',
    role: 'Reviewer',
    species: 'cat',
    color: '#88bbaa',
  },
  projectId,
);
const observerId = String(
  execute(
    'agent.register',
    {
      name: 'External Observe Fixture',
      provider: 'observe',
      role: 'Observer',
      species: 'otter',
      color: '#88aabb',
    },
    projectId,
  ).result['id'],
);
const observedRoot = join(directory, 'observer-fixture');
mkdirSync(observedRoot);
writeFileSync(
  join(observedRoot, 'session.jsonl'),
  JSON.stringify({
    type: 'session_meta',
    payload: { id: randomUUID(), cwd: realpathSync(repository), cli_version: '0.159.2' },
  }) +
    '\n' +
    JSON.stringify({
      type: 'response_item',
      payload: {
        type: 'message',
        role: 'assistant',
        channel: 'final',
        content: [{ type: 'output_text', text: 'Observed fixture only · 不代表任務已完成' }],
      },
    }) +
    '\n',
);
execute(
  'project.execution.configure',
  { liveEnabled: true, maxTurns: 1, timeoutMs: 60000 },
  projectId,
  0,
);
control.close();
setup('live', directory);
const binary = join(directory, 'synthetic-codex');
writeFileSync(
  binary,
  `#!${process.execPath}\nif(process.argv.includes('--version'))console.log('codex-cli 0.159.2');else await import(${JSON.stringify(pathToFileURL(resolve('fixtures/processes/codex-app-server.mjs')).href)});\n`,
  { mode: 0o700 },
);
const verifier = join(directory, 'verify.mjs');
writeFileSync(
  verifier,
  "import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';assert.equal(readFileSync('fixture.txt','utf8'),'synthetic browser evidence');\n",
  { mode: 0o400 },
);
const terminalFixture = join(directory, 'pty-fixture.mjs');
writeFileSync(
  terminalFixture,
  "if(!process.stdin.isTTY)process.exit(98);process.stdin.setRawMode(true);process.stdin.setEncoding('utf8');console.log('PTY READY 狐狸');process.stdin.on('data',s=>console.log('PTY ECHO:'+s+' SIZE:'+process.stdout.columns+'x'+process.stdout.rows));",
);
// A fake interactive `claude` (never the real one): it shows up as a Claude session, writes its own transcript and hook
// events under its own home, and `exec -a` gives the process the name the session scanner looks for.
const home = join(directory, 'home');
const spool = join(home, 'hook-events.jsonl');
const resumable = '11111111-2222-4333-8444-555555555555';
const observedFolder = join(
  home,
  '.claude/projects',
  realpathSync(repository).replace(/[^A-Za-z0-9]/g, '-'),
);
mkdirSync(observedFolder, { recursive: true });
writeFileSync(spool, '');
const at = (offset: number) => new Date(Date.now() - offset).toISOString();
writeFileSync(
  join(observedFolder, `${resumable}.jsonl`),
  [
    { type: 'user', cwd: realpathSync(repository) },
    {
      type: 'user',
      timestamp: at(30000),
      message: { role: 'user', content: 'Earlier question from a terminal' },
    },
    {
      type: 'assistant',
      timestamp: at(20000),
      message: {
        role: 'assistant',
        model: 'claude-fixture-1',
        content: [{ type: 'text', text: 'Earlier answer from a terminal' }],
      },
    },
  ]
    .map((entry) => JSON.stringify(entry))
    .join('\n') + '\n',
);
const claude = join(directory, 'claude');
writeFileSync(
  claude,
  `#!/bin/bash\nexec -a claude ${JSON.stringify(process.execPath)} ${JSON.stringify(resolve('fixtures/processes/claude-tui.mjs'))} --home ${JSON.stringify(home)} --spool ${JSON.stringify(spool)} "$@"\n`,
  { mode: 0o700 },
);
const config = join(directory, 'native.json');
writeFileSync(
  config,
  JSON.stringify({
    enabled: true,
    repositories: [repository],
    observations: {
      fixture: {
        projectId,
        agentId: observerId,
        provider: 'codex',
        projectRoot: repository,
        approvedRoot: observedRoot,
        files: ['session.jsonl'],
      },
    },
    terminals: {
      'pty-fixture': {
        binary: process.execPath,
        args: [terminalFixture],
        root: repository,
        timeoutMs: 60000,
      },
    },
    binaries: { codex: binary, claude },
    cliTerminals: true,
    verifiers: { fixture: { file: verifier, timeoutMs: 3000 } },
  }),
  { mode: 0o600 },
);
const port = process.env['AETHER_E2E_NATIVE_PORT'] ?? '4330'; // playwright.config.ts reads the same variable
mkdirSync('.data', { recursive: true, mode: 0o700 });
writeFileSync('.data/e2e-native-session.json', JSON.stringify({ directory, port: Number(port) }), {
  mode: 0o600,
});
const env = {
  ...process.env,
  PORT: port,
  AETHER_MODE: 'live',
  AETHER_DATA_DIR: directory,
  AETHER_CONTROL_URL: `http://127.0.0.1:${port}`,
  AETHER_NATIVE_CONFIG: config,
  AETHER_LOCAL_SESSIONS_HOME: home,
  AETHER_HOOK_SPOOL: spool,
};
const children = ['control', 'runner'].map((name) =>
  spawn(process.execPath, [`apps/${name}/dist/main.js`], { env, stdio: 'inherit' }),
);
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of children)
  child.once('exit', (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
