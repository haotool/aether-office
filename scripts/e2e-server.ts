import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { setup } from './setup.js';
const directory = mkdtempSync(join(tmpdir(), 'aether-e2e-'));
setup('demo', directory);
mkdirSync('.data', { recursive: true, mode: 0o700 });
writeFileSync('.data/e2e-session.json', JSON.stringify({ directory, port: 4320 }), { mode: 0o600 });
const env = {
  ...process.env,
  PORT: '4320',
  AETHER_MODE: 'demo',
  AETHER_DATA_DIR: directory,
  AETHER_CONTROL_URL: 'http://127.0.0.1:4320',
};
const children = ['control', 'runner'].map((name) =>
  spawn(process.execPath, [`apps/${name}/dist/main.js`], { env, stdio: 'inherit' }),
);
let stopped = false;
const stop = () => {
  if (stopped) return;
  stopped = true;
  for (const child of children) child.kill('SIGTERM');
};
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
for (const child of children)
  child.once('exit', (code) => {
    if (!stopped) {
      process.exitCode = code ?? 1;
      stop();
    }
  });
