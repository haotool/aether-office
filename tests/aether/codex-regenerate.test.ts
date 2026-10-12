import { spawnSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

const script = resolve('scripts/regenerate-codex-protocol.mjs');
const scratch = mkdtempSync(join(tmpdir(), 'aether-codex-regen-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

function fakeCodex(version: string) {
  const bin = join(scratch, `bin-${version}`);
  mkdirSync(bin);
  writeFileSync(
    join(bin, 'codex'),
    `#!/bin/sh\nif [ "$1" = "--version" ]; then echo "codex-cli ${version}"; exit 0; fi\nmkdir -p "$4"\nprintf 'export type Fresh = 1;\\n' > "$4/Fresh.ts"\n`,
  );
  chmodSync(join(bin, 'codex'), 0o755);
  return bin;
}

function repository() {
  const root = mkdtempSync(join(scratch, 'repo-'));
  const generated = join(root, 'packages/providers/generated');
  mkdirSync(join(generated, 'codex-0.159.2-ts'), { recursive: true });
  writeFileSync(join(generated, 'compat.json'), JSON.stringify({ schema: 'codex-0.159.2' }));
  writeFileSync(join(generated, 'codex-0.159.2-ts/Old.ts'), 'export type Old = 0;\n');
  return { root, types: join(generated, 'codex-0.159.2-ts') };
}

const run = (root: string, bin: string, ...args: string[]) =>
  spawnSync(process.execPath, [script, '--root', root, ...args], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}${delimiter}${process.env['PATH'] ?? ''}` },
  });

describe('regenerate-codex-protocol', () => {
  it('reports drift with --check and rewrites the folder without it', () => {
    const { root, types } = repository();
    const bin = fakeCodex('0.159.2');
    expect(run(root, bin, '--check').status).toBe(1);
    expect(run(root, bin).status).toBe(0);
    expect(readFileSync(join(types, 'Fresh.ts'), 'utf8')).toBe('export type Fresh = 1;\n');
    expect(() => readFileSync(join(types, 'Old.ts'))).toThrow();
    expect(run(root, bin, '--check').status).toBe(0);
  });

  it('leaves the files alone when the installed release is not the pinned one', () => {
    const { root, types } = repository();
    const result = run(root, fakeCodex('0.161.0'));
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('0.161.0 is installed but the committed types are 0.159.2');
    expect(readFileSync(join(types, 'Old.ts'), 'utf8')).toBe('export type Old = 0;\n');
  });
});
