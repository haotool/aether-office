import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_VERSION } from '../../packages/contracts/src/index.js';

const read = (file: string) => readFileSync(file, 'utf8');
const rootVersion = (JSON.parse(read('package.json')) as { version: string }).version;
const tracked = (...args: string[]) =>
  spawnSync('git', args, { encoding: 'utf8' }).stdout.split('\n').filter(Boolean);

describe('one version string', () => {
  it('is read from the root package.json', () => {
    expect(APP_VERSION).toBe(rootVersion);
  });

  it('is the same in every workspace package.json', () => {
    const manifests = tracked('ls-files', '--', 'package.json', '*/package.json');
    expect(manifests.length).toBeGreaterThan(1);
    for (const file of manifests)
      expect((JSON.parse(read(file)) as { version: string }).version, file).toBe(rootVersion);
  });

  it('is not written out again in the sources', () => {
    const copies = tracked('grep', '-lF', rootVersion, '--', 'apps', 'packages', ':!*package.json');
    expect(copies).toEqual([]);
  });

  it('is the one the sidebar badge names', () => {
    const [major, minor] = rootVersion.split('.');
    expect(read('apps/web/src/features/shell-chrome/Sidebar.tsx')).toContain(
      `v${major}.${minor}</small>`,
    );
  });
});
