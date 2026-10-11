import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const load = (name: string) => import(pathToFileURL(resolve('scripts/oss', name)).href);
const notices = await load('third-party-notices.mjs');
const reuse = await load('reuse-check.mjs');

const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'aether-licences-')));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

const MIT = (holder: string) =>
  `MIT License\n\nCopyright (c) 2020 ${holder}\n\nPermission is hereby granted, free of charge, to any person obtaining a copy...\n`;

function fakePackage(
  name: string,
  files: Record<string, string>,
  manifest: Record<string, unknown> = {},
) {
  const dir = join(scratch, name.replace('/', '+'));
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name, version: '1.0.0', ...manifest }));
  for (const [file, text] of Object.entries(files)) writeFileSync(join(dir, file), text);
  return dir;
}

const LOCK = `---
lockfileVersion: '9.0'

importers:

  .:
    packageManagerDependencies:
      pnpm:
        specifier: 12.8.1
        version: 12.8.1

packages:

  pnpm@12.8.1:
    resolution: {integrity: sha512-AAAA}

---
lockfileVersion: '9.0'

importers:

  .:
    devDependencies:
      vitest:
        specifier: 1.0.0
        version: 1.0.0

  apps/web:
    dependencies:
      '@aether/kernel':
        specifier: workspace:*
        version: link:../../packages/kernel
      react:
        specifier: 19.0.0
        version: 19.0.0
      vite:
        specifier: 8.0.0
        version: 8.0.0

  packages/kernel:
    dependencies:
      tiny:
        specifier: 1.0.0
        version: 1.0.0(react@19.0.0)

packages:

  '@types/react@19.0.0':
    resolution: {integrity: sha512-BBBB}

  native-darwin-arm64@1.0.0:
    resolution: {integrity: sha512-CCCC}
    cpu: [arm64]
    os: [darwin]

  react@19.0.0:
    resolution: {integrity: sha512-DDDD}

  tiny@1.0.0:
    resolution: {integrity: sha512-EEEE}
    peerDependencies:
      react: ^19

  vite@8.0.0:
    resolution: {integrity: sha512-FFFF}

  vitest@1.0.0:
    resolution: {integrity: sha512-GGGG}

snapshots:

  '@types/react@19.0.0': {}

  native-darwin-arm64@1.0.0:
    optional: true

  react@19.0.0:
    dependencies:
      '@types/react': 19.0.0

  tiny@1.0.0(react@19.0.0):
    dependencies:
      react: 19.0.0
    optionalDependencies:
      native-darwin-arm64: 1.0.0

  vite@8.0.0: {}

  vitest@1.0.0:
    dependencies:
      vite: 8.0.0
`;

describe('lockfile', () => {
  const lock = notices.parseLockfile(LOCK);

  it('reads the project document, not the package-manager one', () => {
    expect(Object.keys(lock.importers)).toEqual(['.', 'apps/web', 'packages/kernel']);
    expect(lock.importers['apps/web'].dependencies.react).toBe('19.0.0');
    expect(lock.packages['native-darwin-arm64@1.0.0'].platform).toBe(true);
    expect(lock.packages['react@19.0.0'].integrity).toBe('sha512-DDDD');
    expect(lock.snapshots['tiny@1.0.0(react@19.0.0)'].optionalDependencies).toEqual({
      'native-darwin-arm64': '1.0.0',
    });
  });

  it('splits scoped keys with peer suffixes', () => {
    expect(notices.splitKey('@a/b@1.2.3(zod@4.0.0)')).toEqual({
      name: '@a/b',
      version: '1.2.3',
      id: '@a/b@1.2.3',
    });
  });

  it('ships the production closure through workspace links, without build tools or type packages', () => {
    const shipped = notices.shippedClosure(lock, { 'apps/web': 'web' });
    expect([...shipped.keys()].sort()).toEqual([
      'native-darwin-arm64@1.0.0',
      'react@19.0.0',
      'tiny@1.0.0',
    ]);
    expect(shipped.has('vite@8.0.0')).toBe(false);
    expect(shipped.has('vitest@1.0.0')).toBe(false);
    expect(shipped.has('@types/react@19.0.0')).toBe(false);
  });
});

describe('licence expressions', () => {
  it.each([
    ['MIT', 'MIT', 'allowed'],
    ['(MIT OR Apache-2.0)', 'MIT', 'allowed'],
    ['GPL-3.0-only OR MIT', 'MIT', 'allowed'],
    ['LGPL-2.1 OR Apache-2.0', 'Apache-2.0', 'allowed'],
    ['(GPL-2.0 OR Apache-2.0) AND ISC', 'Apache-2.0 AND ISC', 'allowed'],
    ['Apache-2.0 WITH LLVM-exception', 'Apache-2.0 WITH LLVM-exception', 'allowed'],
    ['MPL-2.0', 'MPL-2.0', 'conditional'],
    ['MIT AND MPL-2.0', 'MIT AND MPL-2.0', 'conditional'],
    ['AGPL-3.0-or-later', 'AGPL-3.0-or-later', 'denied'],
    ['GPL-2.0+', 'GPL-2.0', 'denied'],
    ['SSPL-1.0', 'SSPL-1.0', 'denied'],
    ['MIT AND GPL-3.0', 'MIT AND GPL-3.0', 'denied'],
    ['PolyForm-Noncommercial-1.0.0', 'PolyForm-Noncommercial-1.0.0', 'denied'],
    ['WTFPL', 'WTFPL', 'unknown'],
    ['SEE LICENSE IN LICENSE.md', 'SEE LICENSE IN LICENSE.md', 'unknown'],
    ['(MIT', '(MIT', 'unknown'],
    ['LicenseRef-Vendor', 'LicenseRef-Vendor', 'conditional'],
  ])('%s -> %s (%s)', (expression, chosen, status) => {
    expect(notices.evaluate(expression)).toEqual({ chosen, status });
  });

  it('rejects malformed expressions', () => {
    expect(() => notices.parseSpdx('MIT OR')).toThrow();
    expect(() => notices.parseSpdx('(MIT AND ISC')).toThrow();
  });

  it('reads old-style licence fields', () => {
    expect(notices.declaredLicense({ license: { type: 'MIT' } })).toBe('MIT');
    expect(notices.declaredLicense({ licenses: [{ type: 'MIT' }, { type: 'Apache-2.0' }] })).toBe(
      'MIT OR Apache-2.0',
    );
    expect(notices.declaredLicense({})).toBeNull();
  });
});

describe('licence texts', () => {
  it('recognises texts, including several in one file', () => {
    expect(notices.sniffLicenses(MIT('A'))).toEqual(['MIT']);
    expect(
      notices.sniffLicenses(
        'ISC License\nPermission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice ...\n' +
          MIT('Feather'),
      ),
    ).toEqual(['MIT', 'ISC']);
    expect(
      notices.sniffLicenses(
        'Redistribution and use in source and binary forms ... * The names of any contributors may not be used to endorse',
      ),
    ).toEqual(['BSD-3-Clause']);
    expect(notices.sniffLicenses('All rights reserved.')).toEqual([]);
  });

  it('extracts copyright lines and skips licence boilerplate', () => {
    const apache =
      'copyright license to reproduce, prepare Derivative Works of,\n(c) You must retain, in the Source form\nCopyright [yyyy] [name of copyright owner]\nCopyright 2024 Acme, Inc.';
    expect(notices.copyrightLines(apache)).toEqual(['Copyright 2024 Acme, Inc.']);
    expect(notices.copyrightLines('© Vendor PBC. All rights reserved.')).toEqual([
      '© Vendor PBC. All rights reserved.',
    ]);
    expect(
      notices.copyrightLines(
        'Original code Copyright Jane Doe <j@x>\nThe above copyright notice and this',
      ),
    ).toEqual(['Original code Copyright Jane Doe <j@x>']);
  });

  it('hashes texts independently of line endings and trailing spaces', () => {
    expect(notices.textHash('a  \r\nb\r\n')).toBe(notices.textHash('a\nb'));
  });
});

describe('packages and notices', () => {
  const describePkg = (name: string, files: Record<string, string>, manifest = {}) =>
    notices.describePackage({ name, version: '1.0.0', dir: fakePackage(name, files, manifest) });

  it('flags a licence file that contradicts package.json', () => {
    const pkg = describePkg('liar', { LICENSE: MIT('Liar') }, { license: 'ISC' });
    expect(pkg.problems).toEqual(['LICENSE reads as MIT but package.json says ISC']);
  });

  it('collects licence and NOTICE files and copyright holders', () => {
    const pkg = describePkg(
      'apache-thing',
      {
        LICENSE: 'Apache License, Version 2.0\nCopyright 2023 Apache Thing Authors',
        NOTICE: 'Apache Thing\nCopyright 2023',
      },
      { license: 'Apache-2.0' },
    );
    expect(pkg.problems).toEqual([]);
    expect(pkg.copyright).toEqual(['Copyright 2023 Apache Thing Authors']);
    expect(pkg.notices.map((n: { file: string }) => n.file)).toEqual(['NOTICE']);
  });

  it('reports a package that is not installed', () => {
    const pkg = notices.describePackage({ name: 'ghost', version: '1.0.0', dir: null });
    expect(pkg.status).toBe('unknown');
    expect(notices.policyProblems([{ ...pkg, scope: 'dev' }])).toContain(
      'ghost@1.0.0: not installed: run pnpm install --frozen-lockfile',
    );
  });

  it('records platform builds by family without reading them', () => {
    const pkg = notices.describePackage({
      name: '@esbuild/sunos-x64',
      version: '0.1.0',
      dir: null,
      platform: true,
    });
    expect(pkg.chosen).toBe('MIT');
    expect(notices.policyProblems([{ ...pkg, scope: 'dev' }])).toEqual([]);
  });

  it('groups identical licence texts and reproduces NOTICE files of shipped packages only', () => {
    const shared = MIT('Same Holder');
    const a = { ...describePkg('alpha', { LICENSE: shared }, { license: 'MIT' }), scope: 'web' };
    const b = {
      ...describePkg('beta', { 'LICENSE.md': `${shared}\r\n` }, { license: 'MIT' }),
      scope: 'server',
    };
    const c = {
      ...describePkg(
        'gamma',
        { LICENSE: 'Apache License, Version 2.0', NOTICE: 'Gamma notice' },
        { license: 'Apache-2.0' },
      ),
      scope: 'server',
    };
    const d = {
      ...describePkg(
        'delta-dev',
        { LICENSE: MIT('Dev'), NOTICE: 'Dev notice' },
        { license: 'MIT' },
      ),
      scope: 'dev',
    };
    const md = notices.renderNotices([a, b, c, d]);
    expect(md.match(/MIT License\n\nCopyright \(c\) 2020 Same Holder/g)).toHaveLength(1);
    expect(md).toContain('Used by: `alpha@1.0.0`, `beta@1.0.0`.');
    expect(md).toContain('Gamma notice');
    expect(md).not.toContain('Dev notice');
    expect(md).toContain('| delta-dev | 1.0.0 | MIT |');
  });

  it('fails denied licences anywhere and conditional ones when shipped without approval', () => {
    const gpl = {
      ...describePkg('copyleft', { LICENSE: 'GNU GENERAL PUBLIC LICENSE' }, { license: 'GPL-3.0' }),
      scope: 'dev',
    };
    const mplDev = { ...describePkg('mpl-dev', {}, { license: 'MPL-2.0' }), scope: 'dev' };
    const mplShipped = { ...describePkg('mpl-shipped', {}, { license: 'MPL-2.0' }), scope: 'web' };
    expect(notices.policyProblems([gpl, mplDev, mplShipped])).toEqual([
      'copyleft@1.0.0: GPL-3.0 is denied by the licence policy',
      'mpl-shipped@1.0.0: MPL-2.0 is shipped (web) and needs an entry in APPROVED',
    ]);
  });

  it('produces a deterministic CycloneDX document', () => {
    const pkg = {
      ...describePkg('@scope/sbom', { LICENSE: MIT('S') }, { license: 'MIT' }),
      integrity: 'sha512-AAEC',
      scope: 'web',
    };
    const one = notices.renderSbom([pkg], { name: 'x', version: '1.0.0' });
    expect(one).toBe(notices.renderSbom([pkg], { name: 'x', version: '1.0.0' }));
    const bom = JSON.parse(one);
    expect(bom.specVersion).toBe('1.5');
    expect(bom.components[0].purl).toBe('pkg:npm/%40scope/sbom@1.0.0');
    expect(bom.components[0].hashes).toEqual([{ alg: 'SHA-512', content: '000102' }]);
    expect(bom.components[0].licenses).toEqual([{ license: { id: 'MIT' } }]);
  });

  it('replaces only the generated part of the inventory', () => {
    const doc = `intro\n${notices.INVENTORY_BEGIN}\nold\n${notices.INVENTORY_END}\noutro\n`;
    expect(notices.spliceInventory(doc, 'NEW')).toBe('intro\nNEW\noutro\n');
    expect(() => notices.spliceInventory('no markers', 'NEW')).toThrow();
  });
});

describe('REUSE coverage', () => {
  const toml = `version = 1
[[annotations]]
path = "**"
precedence = "aggregate"
SPDX-FileCopyrightText = "2026 Us"
SPDX-License-Identifier = "MIT"

# vendored
[[annotations]]
path = ["vendor/*.js", "gone/**"]
SPDX-FileCopyrightText = ["2025 Them"]
SPDX-License-Identifier = "Apache-2.0"
`;

  it('parses annotations and matches REUSE globs', () => {
    const annotations = reuse.parseReuseToml(toml);
    expect(annotations[1]).toEqual({
      paths: ['vendor/*.js', 'gone/**'],
      copyright: ['2025 Them'],
      license: 'Apache-2.0',
    });
    expect(reuse.globToRegExp('vendor/*.js').test('vendor/a.js')).toBe(true);
    expect(reuse.globToRegExp('vendor/*.js').test('vendor/x/a.js')).toBe(false);
    expect(reuse.globToRegExp('**').test('a/b/c.ts')).toBe(true);
  });

  it('reports missing licence texts, unused ones and stale paths', () => {
    const problems = reuse.check(['src/a.ts', 'vendor/a.js'], reuse.parseReuseToml(toml), [
      'MIT.txt',
      'GPL-3.0.txt',
    ]);
    expect(problems).toEqual([
      'LICENSES/Apache-2.0.txt is missing',
      'LICENSES/GPL-3.0.txt is not used by REUSE.toml',
      'REUSE.toml: "gone/**" matches no tracked file',
    ]);
  });
});
