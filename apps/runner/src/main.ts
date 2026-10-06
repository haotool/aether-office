import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Runner } from './runner.js';
import { Journal } from './journal.js';
import { NativeExecutor } from './native.js';
import { assertIndependentStorage } from './storage.js';
const mode = process.env['AETHER_MODE'] === 'demo' ? 'demo' : 'live';
const directory = resolve(process.env['AETHER_DATA_DIR'] ?? `.data/${mode}`);
const token = (() => {
  try {
    return readFileSync(resolve(directory, 'runner-token'), 'utf8').trim();
  } catch {
    console.error(
      `No runner credential in ${directory}. Enroll this machine first: pnpm runner:enroll (see docs/getting-started.md).`,
    );
    return process.exit(1);
  }
})();
const configPath = process.env['AETHER_NATIVE_CONFIG'];
const nativeConfig =
  mode === 'live' && configPath
    ? (JSON.parse(readFileSync(resolve(configPath), 'utf8')) as { repositories?: string[] })
    : undefined;
if (nativeConfig) assertIndependentStorage(directory, nativeConfig.repositories ?? []);
const native = nativeConfig
  ? new NativeExecutor(resolve(directory, 'runner', 'workspaces'), nativeConfig)
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
await runner.reapSurvivors();
runner.start();
