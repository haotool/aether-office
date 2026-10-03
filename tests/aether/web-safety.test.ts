import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const script = resolve('scripts/check-boundaries.mjs');
const lint = (cwd: string) => spawnSync(process.execPath, [script], { cwd, encoding: 'utf8' });

it('the real tree passes the unsafe-HTML and terminal-addon lint', () => {
  expect(lint(process.cwd()).status).toBe(0);
});

it('flags HTML injection, code evaluation and clipboard/link addons in web code', () => {
  for (const bad of [
    'export const a = <div dangerouslySetInnerHTML={{ __html: x }} />;',
    'el.innerHTML = value;',
    'eval(input);',
    "import { ClipboardAddon } from '@xterm/addon-clipboard';",
    "import { WebLinksAddon } from '@xterm/addon-web-links';",
  ]) {
    const cwd = mkdtempSync(join(tmpdir(), 'aether-lint-'));
    mkdirSync(join(cwd, 'apps/web/src'), { recursive: true });
    mkdirSync(join(cwd, 'packages'), { recursive: true });
    writeFileSync(join(cwd, 'apps/web/src/x.tsx'), bad);
    const result = lint(cwd);
    expect(result.status, bad).toBe(1);
    expect(result.stderr).toContain('unsafe HTML');
  }
});

it('flags Math.random in product code so progress can never be fabricated', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'aether-lint-'));
  mkdirSync(join(cwd, 'apps/control/src'), { recursive: true });
  mkdirSync(join(cwd, 'packages'), { recursive: true });
  writeFileSync(join(cwd, 'apps/control/src/x.ts'), 'export const progress = Math.random();');
  const result = lint(cwd);
  expect(result.status).toBe(1);
  expect(result.stderr).toContain('Math.random');
});

it('enforces the architecture boundaries: kernel stays pure and web/scene never reach Node or provider SDKs', () => {
  const cases: [string, string][] = [
    ['packages/kernel/src/x.ts', "import { readFileSync } from 'node:fs';"],
    ['packages/kernel/src/x.ts', "import React from 'react';"],
    ['packages/kernel/src/x.ts', "import Fastify from 'fastify';"],
    ['packages/kernel/src/x.ts', "import Database from 'better-sqlite3';"],
    ['apps/web/src/x.ts', "import { spawn } from 'node:child_process';"],
    ['packages/office-scene/src/x.ts', "import { join } from 'node:path';"],
    ['apps/runner/src/x.ts', "import { db } from '../../control/src/db/connection.js';"],
    ['apps/web/src/x.ts', '// @ts-ignore\nexport const a = 1;'],
  ];
  for (const [file, source] of cases) {
    const cwd = mkdtempSync(join(tmpdir(), 'aether-lint-'));
    const folder = file.split('/').slice(0, -1).join('/');
    mkdirSync(join(cwd, folder), { recursive: true });
    mkdirSync(join(cwd, 'apps'), { recursive: true });
    mkdirSync(join(cwd, 'packages'), { recursive: true });
    writeFileSync(join(cwd, file), source);
    expect(lint(cwd).status, `${file}: ${source}`).toBe(1);
  }
});
