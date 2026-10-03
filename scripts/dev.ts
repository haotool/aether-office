import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { setup } from './setup.js';
const mode = process.argv.includes('--demo') ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
setup(mode, directory);
const env = {
  ...process.env,
  AETHER_MODE: mode,
  AETHER_DATA_DIR: directory,
  AETHER_SERVE_WEB: '0',
};
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'apps/control/src/main.ts'], {
    env,
    stdio: 'inherit',
  }),
  spawn(
    process.execPath,
    ['apps/web/node_modules/vite/bin/vite.js', '--config', 'apps/web/vite.config.ts', 'apps/web'],
    { env, stdio: 'inherit' },
  ),
];
if (mode === 'demo')
  children.push(
    spawn(process.execPath, ['--import', 'tsx', 'apps/runner/src/main.ts'], {
      env,
      stdio: 'inherit',
    }),
  );
let stopping = false;
const stop = () => {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
};
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, stop);
for (const child of children)
  child.once('exit', (code) => {
    if (!stopping) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
console.log(`AETHER ${mode.toUpperCase()} UI: http://127.0.0.1:4311`);
