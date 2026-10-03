import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Runner } from './runner.js';
import { Journal } from './journal.js';
import { NativeExecutor } from './native.js';
const mode = process.env['AETHER_MODE'] === 'demo' ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
const token = readFileSync(resolve(directory, 'runner-token'), 'utf8').trim();
const configPath = process.env['AETHER_NATIVE_CONFIG'];
const native =
  mode === 'live' && configPath
    ? new NativeExecutor(
        resolve(directory, 'runner', 'workspaces'),
        JSON.parse(readFileSync(resolve(configPath), 'utf8')),
      )
    : undefined;
const runner = new Runner(
  process.env['AETHER_CONTROL_URL'] ?? 'http://127.0.0.1:4310',
  token,
  new Journal(resolve(directory, 'runner', 'journal.json')),
  native,
);
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => {
    void runner.shutdown().catch(() => {
      console.error('Runner stopped with unacknowledged reports; journal retained.');
      process.exitCode = 1;
    });
  });
runner.start();
