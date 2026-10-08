import { describe, expect, it } from 'vitest';
import {
  a11y,
  bundleBudgets,
  declarations,
  disabledWithoutReason,
  directlyImported,
  entryScore,
  envNames,
  failing,
  findingLocation,
  firstLoadAssets,
  FLAKY,
  inlinePairs,
  localeKeys,
  maturity,
  measureStyles,
  mediaViolations,
  memoryRepo,
  missingFlags,
  missingPaths,
  openDecisions,
  parityGaps,
  parseMaturity,
  publicRoutes,
  REQUIRED_FLAGS,
  routeFindings,
  security,
  structure,
  tests,
  ui,
  unknownCommands,
  versionFacts,
} from './quality-score-shared.js';

describe('structure rules', () => {
  const lines = (n: number) =>
    Array.from({ length: n }, (_, i) => `const v${i} = ${i};`).join('\n');
  const base = {
    facts: [] as unknown[],
    graph: { runtime: new Map(), uses: [], reexportAll: new Map() },
  };

  it('flags long files, markers, suppressions and console output, and skips tests for console', () => {
    const repo = memoryRepo({
      'apps/a/src/big.ts': lines(450),
      'apps/a/src/huge.ts': lines(900),
      'apps/a/src/note.ts': '// TODO: later\n// @ts-ignore\nconsole.log(1);\n',
      'tests/aether/x.test.ts': 'console.log(1);\n',
    });
    const rules = structure(repo, base);
    expect(failing(rules)).toEqual(
      expect.arrayContaining([
        'file-size-400',
        'file-size-800',
        'todo-markers',
        'suppressions',
        'console-output',
      ]),
    );
    const consoleRule = rules.find((r: { id: string }) => r.id === 'console-output');
    expect(consoleRule.value).toBe(1);
    expect(consoleRule.details[0]).toContain('apps/a/src/note.ts:3');
  });

  it('passes a small clean repository', () => {
    const repo = memoryRepo({ 'apps/a/src/ok.ts': 'export const a = 1;\n' });
    expect(failing(structure(repo, base))).toEqual([]);
  });
});

describe('type rules', () => {
  it('lists the strictness flags that are off', () => {
    expect(missingFlags({ strict: true, noUnusedLocals: true }, REQUIRED_FLAGS)).toEqual([
      'noUncheckedIndexedAccess',
    ]);
  });
});

describe('test rules', () => {
  it('detects fixed sleeps and ports but not a conditional skip or an inject origin', () => {
    const repo = memoryRepo({
      'e2e/a.spec.ts':
        "await page.waitForTimeout(500);\ntest.skip(!RUN, 'gpu only');\nconst u = 'http://127.0.0.1:5280';\n",
      'tests/aether/b.test.ts':
        "origin: 'http://127.0.0.1:8780';\nawait new Promise((r) => setTimeout(r, 200));\nserver.listen(4999);\nit.skip('later', () => {});\n",
    });
    const hits = FLAKY.flatMap(({ where, pattern }: { where: RegExp; pattern: RegExp }) =>
      repo.files
        .filter((f: string) => where.test(f))
        .flatMap((f: string) =>
          repo
            .read(f)
            .split('\n')
            .filter((l: string) => pattern.test(l)),
        ),
    );
    expect(hits).toHaveLength(4);
    const rules = tests(repo, {
      facts: [],
      graph: { uses: [] },
    });
    expect(rules.find((r: { id: string }) => r.id === 'skipped-tests').value).toBe(1);
    expect(rules.find((r: { id: string }) => r.id === 'coverage').status).toBe('skipped');
  });

  it('credits a module a test imports through a barrel', () => {
    const uses = [
      {
        from: 'tests/aether/a.test.ts',
        target: 'packages/k/src/index.ts',
        names: ['f'],
        namespace: false,
      },
      {
        from: 'packages/k/src/index.ts',
        target: 'packages/k/src/f.ts',
        names: ['f'],
        namespace: false,
        reexport: true,
      },
      {
        from: 'packages/k/src/index.ts',
        target: 'packages/k/src/g.ts',
        names: ['g'],
        namespace: false,
        reexport: true,
      },
    ];
    const direct = directlyImported(uses, (f: string) => f.startsWith('tests/'));
    expect([...direct].sort()).toEqual(['packages/k/src/f.ts', 'packages/k/src/index.ts']);
  });
});

describe('ui token rules', () => {
  const css = [
    '.a {',
    '  width: 240px;',
    '  height: 100vh;',
    '  transition: opacity 0.2s;',
    '  box-shadow: 0 4px 8px var(--shade);',
    '  line-height: 1.5;',
    '  color: red !important;',
    '  padding-left: var(--space-8);',
    '}',
    '@media (max-width: 777px) {',
    '}',
    '@media (max-width: 760px) {',
    '}',
    '.ok { width: var(--w); transition: opacity var(--dur); line-height: var(--lh-body); max-width: 1px; }',
  ].join('\n');

  it('counts each literal family and honours the breakpoint list', () => {
    const repo = memoryRepo({
      'apps/web/src/styles/a.css': css,
      'apps/web/src/styles/tokens.css': '--w: 240px;',
    });
    const { counts } = measureStyles(repo, [
      'apps/web/src/styles/a.css',
      'apps/web/src/styles/tokens.css',
    ]);
    expect(counts).toMatchObject({
      'literal-size': 1,
      'viewport-height': 1,
      'literal-duration': 1,
      'literal-shadow': 1,
      'literal-line-height': 1,
      important: 1,
      'media-breakpoint': 1,
    });
    expect(declarations(css)[0]).toMatchObject({ property: 'width', value: '240px', line: 2 });
    expect(mediaViolations(css)).toEqual([{ line: 10, text: '@media (max-width: 777px) {' }]);
  });

  it('marks the browser-run rules as not run when no result is recorded', () => {
    const repo = memoryRepo({ 'apps/web/src/styles/a.css': '.a { color: red; }\n' });
    const rules = ui(repo, { root: '/nonexistent' });
    expect(rules.find((r: { id: string }) => r.id === 'role-variance').status).toBe('skipped');
    expect(rules.find((r: { id: string }) => r.id === 'baseline-regression').status).toBe(
      'skipped',
    );
  });

  it('measures against the baseline file when there is one', () => {
    const repo = memoryRepo({
      'apps/web/src/styles/a.css': '.a {\n  width: 240px;\n}\n',
      'scripts/design-token-baseline.json': '{"literal-size":0}',
    });
    const rules = ui(repo, { root: '/nonexistent' });
    const regression = rules.find((r: { id: string }) => r.id === 'baseline-regression');
    expect(regression.details).toEqual(['literal-size: 1 now, baseline 0']);
  });
});

describe('accessibility and i18n rules', () => {
  const table = (keys: string[]) =>
    `export const t = {\n${keys.map((k) => `  ${k}: 'x',`).join('\n')}\n};\n`;

  it('reads the keys of a locale table and reports a gap in either language', () => {
    expect([...localeKeys("  'a-b': 'x',\n  c: 'y',\n    nested: 1,\n")]).toEqual(['a-b', 'c']);
    const repo = memoryRepo({
      'apps/web/src/locales/en.ts': table(['one', 'two']),
      'apps/web/src/locales/zh.ts': table(['one', 'three']),
      'apps/web/src/locales/squad-en.ts': table(['s']),
      'apps/web/src/locales/squad-zh.ts': table(['s']),
    });
    expect(parityGaps(repo).map((g: { message: string }) => g.message)).toEqual([
      'apps/web/src/locales/zh.ts: missing "two" (present in apps/web/src/locales/en.ts)',
      'apps/web/src/locales/en.ts: missing "three" (present in apps/web/src/locales/zh.ts)',
    ]);
  });

  it('counts inline bilingual pairs and flags files above the baseline', () => {
    const repo = memoryRepo({
      'apps/web/src/A.tsx':
        "const a = zh ? '今天' : 'Today';\nconst b = locale === 'en' ? 'x' : 'y';\n",
      'tests/aether/inline-i18n-baseline.json': '{"apps/web/src/A.tsx":1}',
    });
    expect(inlinePairs(repo)).toEqual({ 'apps/web/src/A.tsx': 2 });
    const rules = a11y(repo);
    expect(rules.find((r: { id: string }) => r.id === 'inline-i18n-regression').value).toBe(1);
  });

  it('finds a disabled control that gives no reason, but accepts title, whyNot and a spread why object', () => {
    const jsx = [
      '<button disabled={!ok} onClick={() => go()}>A</button>',
      '<button disabled={!ok} title="why">B</button>',
      '<button disabled={!ok} {...whyNot(t, [ok, "needOwner"])}>C</button>',
      '<button disabled={!ok} {...why}>E</button>',
      '<AllowButton disabled={!ok} why={why} />',
      '<button onClick={() => go()}>D</button>',
    ].join('\n');
    expect(disabledWithoutReason(jsx)).toEqual([1]);
  });
});

describe('performance budgets', () => {
  it('reads the budgets from the bundle-size gate and the first-load files from index.html', () => {
    expect(bundleBudgets('const TOTAL_BUDGET_KB = 1000;\nconst CHUNK_BUDGET_KB = 450;')).toEqual({
      total: 1000,
      chunk: 450,
    });
    const html =
      '<script type="module" src="/assets/i.js"></script><link rel="modulepreload" href="/assets/m.js"><link rel="stylesheet" href="/assets/s.css"><link rel="icon" href="/f.svg">';
    expect(firstLoadAssets(html)).toEqual(['/assets/i.js', '/assets/m.js', '/assets/s.css']);
  });
});

describe('docs rules', () => {
  it('checks pnpm commands in code but not in prose', () => {
    const md =
      'pnpm has a lock file. Run `pnpm test` and `pnpm nothing`.\n```sh\npnpm run build\npnpm exec vitest\npnpm ghost\n```\n';
    const names = unknownCommands(md, new Set(['test', 'build'])).map(
      (h: { name: string }) => h.name,
    );
    expect(names).toEqual(['nothing', 'ghost']);
  });

  it('finds documented files and variables that do not exist', () => {
    const exists = (f: string) => f === 'scripts/a.ts';
    const md = 'See `scripts/a.ts` and `scripts/gone.ts` and `scripts/*.ts`.';
    expect(missingPaths(md, exists, 'docs/x.md')).toEqual([{ line: 1, ref: 'scripts/gone.ts' }]);
    expect(envNames('Set AETHER_PORT_X=1 not AETHER_ alone')).toEqual(['AETHER_PORT_X']);
  });
});

describe('security rules', () => {
  const server = [
    'export const PUBLIC_ROUTES: ReadonlySet<string> = new Set([',
    "  'GET /health',",
    "  'POST /api/login', // the owner token is the credential",
    "  'POST /api/open', // the code is the credential",
    ']);',
  ].join('\n');

  it('parses the route table and checks documentation and rate limits', () => {
    expect(publicRoutes(server).map((r: { route: string }) => r.route)).toEqual([
      'GET /health',
      'POST /api/login',
      'POST /api/open',
    ]);
    const repo = memoryRepo({
      'apps/control/src/server.ts': server,
      'apps/control/src/routes/auth.ts':
        "app.post('/api/login', h); throw new DomainError('LOGIN_RATE_LIMIT', 429);",
      'apps/control/src/routes/open.ts': "app.post('/api/open', h);",
      'docs/security.md': 'GET /health answers without a session.',
    });
    const found = routeFindings(repo);
    expect(found.undocumented).toEqual([]);
    expect(found.unlimited.map((r: { route: string }) => r.route)).toEqual([
      'GET /health',
      'POST /api/open',
    ]);
  });

  it('flags a network call from the shipped web code and skips gitleaks when absent', () => {
    const repo = memoryRepo({
      'apps/control/src/server.ts': server,
      'apps/web/src/a.ts': "fetch('https://example.com/x');\nfetch('/api/x');\n",
    });
    const rules = security(repo, { readiness: [] });
    expect(rules.find((r: { id: string }) => r.id === 'web-network').value).toBe(1);
    expect(rules.find((r: { id: string }) => r.id === 'gitleaks').status).toBe('skipped');
  });
});

describe('open-source rules', () => {
  it('lists the maintainer decisions without scoring them', () => {
    const md =
      '**阻擋公開（Blockers）**\n1. 完成歷史清理\n2. 決定專案名稱\n\n**應該修**\n3. other\n';
    expect(openDecisions(md)).toHaveLength(2);
  });

  it('reports where personal data was found, never the data itself', () => {
    expect(
      findingLocation('fail: docs/a.md:31 user-path absolute macOS home path /Users/someone'),
    ).toBe('docs/a.md:31 user-path');
  });

  it('finds workspace versions that differ from the root', () => {
    const repo = memoryRepo({
      'package.json': '{"version":"1.0.0"}',
      'packages/a/package.json': '{"version":"1.0.1"}',
    });
    expect(versionFacts(repo).mismatched).toEqual(['packages/a/package.json: 1.0.1 (root 1.0.0)']);
  });
});

describe('product maturity', () => {
  it('scores half for building and half for proof', () => {
    expect(entryScore({ implementationStatus: 'implemented', verificationStatus: 'passed' })).toBe(
      1,
    );
    expect(entryScore({ implementationStatus: 'implemented', verificationStatus: 'partial' })).toBe(
      0.75,
    );
    expect(entryScore({ implementationStatus: 'partial', verificationStatus: 'partial' })).toBe(
      0.5,
    );
  });

  it('reads the optional audit input and rejects a malformed one', () => {
    expect(() => parseMaturity('{"features":[{"id":"a","score":120}]}')).toThrow(/needs an id/);
    const ledger = JSON.stringify([
      { id: 'A', implementationStatus: 'implemented', verificationStatus: 'passed' },
    ]);
    const rules = maturity(
      memoryRepo({
        'docs/verification/features.json': ledger,
        'docs/quality/maturity.json': '{"features":[{"id":"a","score":80}]}',
      }),
    );
    expect(rules.find((r: { id: string }) => r.id === 'maturity-audit').value).toBe(80);
    expect(
      maturity(memoryRepo({ 'docs/verification/features.json': ledger })).find(
        (r: { id: string }) => r.id === 'maturity-audit',
      ).status,
    ).toBe('skipped');
  });
});
