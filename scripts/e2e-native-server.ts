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
    binaries: { codex: binary },
    verifiers: { fixture: { file: verifier, timeoutMs: 3000 } },
  }),
  { mode: 0o600 },
);
mkdirSync('.data', { recursive: true, mode: 0o700 });
writeFileSync('.data/e2e-native-session.json', JSON.stringify({ directory, port: 4330 }), {
  mode: 0o600,
});
const env = {
  ...process.env,
  PORT: '4330',
  AETHER_MODE: 'live',
  AETHER_DATA_DIR: directory,
  AETHER_CONTROL_URL: 'http://127.0.0.1:4330',
  AETHER_NATIVE_CONFIG: config,
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
