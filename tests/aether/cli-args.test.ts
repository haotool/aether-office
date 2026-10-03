import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import { setup } from '../../scripts/setup.js';

const run = (script: string, args: string[], cwd: string, env: Record<string, string> = {}) =>
  spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), resolve(script), ...args], {
    cwd,
    encoding: 'utf8',
    env: { PATH: process.env['PATH'] ?? '', HOME: cwd, ...env },
  });

it('an absent flag is never read as the next token: nothing is created at a path named after a flag', () => {
  const work = mkdtempSync(join(tmpdir(), 'aether-cli-'));
  try {
    const data = join(work, 'data');
    setup('demo', data);
    const out = join(work, 'out');
    const backup = run('scripts/backup.ts', ['create', '--out', out], work, {
      AETHER_DATA_DIR: data,
    });
    expect(backup.status, backup.stderr).toBe(0);
    expect(readdirSync(out).some((f) => f.endsWith('.manifest.json'))).toBe(true);
    expect(existsSync(join(work, '--out'))).toBe(false);

    const project = join(work, 'project');
    const hooks = run('scripts/hooks.ts', ['install', '--project', project], work);
    expect(hooks.status, hooks.stderr).toBe(0);
    expect(existsSync(join(project, '.claude', 'settings.local.json'))).toBe(true);
    expect(readdirSync(work).filter((f) => f.startsWith('--'))).toEqual([]);
    const removed = run('scripts/hooks.ts', ['remove', '--project', project], work);
    expect(removed.status).toBe(0);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}, 60000);
