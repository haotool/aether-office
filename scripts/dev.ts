import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { say } from '../apps/control/src/stdio.js';
import { portFree } from './ports.js';
import { setup } from './setup.js';
const mode = process.argv.includes('--demo') ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
const port = Number(process.env['PORT'] ?? 4310);
const ui = port + 1;
const command = mode === 'demo' ? 'pnpm demo' : 'pnpm dev';
if (!Number.isInteger(port) || port < 1024 || port > 65534) {
  console.error(
    say(
      'PORT must be a whole number from 1024 to 65534 (the UI uses the next port).',
      'PORT 必須是 1024 到 65534 的整數（介面使用下一個埠）。',
    ),
  );
  process.exit(1);
}
for (const [number, host] of [
  [port, process.env['AETHER_HOST'] ?? '127.0.0.1'],
  [ui, '127.0.0.1'],
] as const)
  if (!(await portFree(number, host))) {
    console.error(
      say(
        `Port ${number} is already in use. Stop what uses it, or pick another with PORT=<number> ${command} (the UI uses the next port).`,
        `埠 ${number} 已被使用。請先停掉佔用它的程式，或用 PORT=<數字> ${command} 改用其他埠（介面使用下一個埠）。`,
      ),
    );
    process.exit(1);
  }
setup(mode, directory);
const env = {
  ...process.env,
  AETHER_MODE: mode,
  AETHER_DATA_DIR: directory,
  AETHER_SERVE_WEB: '0',
  PORT: String(port),
  AETHER_CONTROL_URL: `http://127.0.0.1:${port}`,
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
console.log(`AETHER ${mode.toUpperCase()} UI: http://127.0.0.1:${ui}`);
