import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const generated = resolve('packages/providers/generated');
const compat = JSON.parse(readFileSync(join(generated, 'compat.json'), 'utf8')) as {
  schema: string;
  verifiedCliVersions: string[];
};

const digest = (directory: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else
        out[path.slice(directory.length)] = createHash('sha256')
          .update(readFileSync(path))
          .digest('hex');
    }
  };
  walk(directory);
  return out;
};

it('records which CLI versions the committed protocol types are verified against', () => {
  expect(readdirSync(generated)).toContain(`${compat.schema}-ts`);
  expect(compat.verifiedCliVersions).toContain(compat.schema.replace('codex-', ''));
});

const version = spawnSync('codex', ['--version'], { encoding: 'utf8' });
const installed = version.status === 0 ? /\d+\.\d+\.\d+/.exec(version.stdout)?.[0] : undefined;

// The committed types must be exactly what the installed binary generates, so they cannot be hand-edited or stale.
describe.skipIf(!installed || !compat.verifiedCliVersions.includes(installed))(
  'against the installed Codex binary',
  () => {
    it('regenerating the TypeScript protocol types reproduces the committed files byte for byte', () => {
      const out = mkdtempSync(join(tmpdir(), 'aether-codex-gen-'));
      try {
        execFileSync('codex', ['app-server', 'generate-ts', '--out', out], {
          stdio: 'ignore',
          timeout: 120000,
        });
        expect(digest(out)).toEqual(digest(join(generated, `${compat.schema}-ts`)));
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    }, 150000);
  },
);
