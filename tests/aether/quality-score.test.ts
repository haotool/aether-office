import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

// The scorer is plain .mjs under scripts/quality; each rule family is tested on an in-memory repository.
const load = (name: string) => import(pathToFileURL(resolve('scripts/quality', name)).href);
const { rule, skipped, info, scoreArea, overall, blockers } = await load('model.mjs');
const { memoryRepo } = await load('repo.mjs');
const { findDuplicates } = await load('dup.mjs');
const { findCycles, deadExports, fanIn, makeResolver } = await load('graph.mjs');
const { analyzeProject } = await load('ast.mjs');
const { structure } = await load('areas/structure.mjs');
const { missingFlags, REQUIRED_FLAGS } = await load('areas/types.mjs');
const { tests, directlyImported, FLAKY } = await load('areas/tests.mjs');
const { declarations, measureStyles, mediaViolations, ui } = await load('areas/ui.mjs');
const { localeKeys, parityGaps, inlinePairs, disabledWithoutReason, a11y } =
  await load('areas/a11y.mjs');
const { bundleBudgets, firstLoadAssets } = await load('areas/perf.mjs');
const { unknownCommands, missingPaths, envNames } = await load('areas/docs.mjs');
const { publicRoutes, routeFindings, security } = await load('areas/security.mjs');
const { openDecisions, versionFacts } = await load('areas/oss.mjs');
const { entryScore, parseMaturity, maturity } = await load('areas/maturity.mjs');
const { findingLocation } = await load('lib.mjs');
const { raiseFloors, floorProblems, staleness, parseFloors } = await load('floors.mjs');
const { renderMarkdown, renderTable } = await load('render.mjs');

describe('scoring model', () => {
  it('takes the weight in proportion to the excess, capped at the full weight', () => {
    expect(rule({ id: 'a', label: 'a', weight: 10, value: 0 }).penalty).toBe(0);
    expect(rule({ id: 'a', label: 'a', weight: 10, value: 5, full: 20 }).penalty).toBe(2.5);
    expect(rule({ id: 'a', label: 'a', weight: 10, value: 500, full: 20 }).penalty).toBe(10);
    expect(rule({ id: 'a', label: 'a', weight: 10, value: 4, limit: 3, full: 2 }).penalty).toBe(5);
  });

  it('scores a minimum from below', () => {
    const r = rule({ id: 'c', label: 'c', weight: 10, value: 70, atLeast: 80, full: 40 });
    expect(r.penalty).toBe(2.5);
    expect(r.minimum).toBe(true);
    expect(rule({ id: 'c', label: 'c', weight: 10, value: 90, atLeast: 80 }).penalty).toBe(0);
  });

  it('costs nothing for a rule that was not run, and reports n/a below half the weight', () => {
    const rules = [
      rule({ id: 'a', label: 'a', weight: 40, value: 10, full: 10 }),
      skipped('b', 'b', 40, 'needs a build'),
      info('c', 'c', 3),
    ];
    const half = scoreArea('x', 'X', rules);
    expect(half.score).toBe(60);
    expect(half.measured).toBe(50);
    expect(scoreArea('x', 'X', [rules[1], rules[1], rules[0]]).score).toBeNull();
    expect(overall([half, { score: null }])).toBe(60);
    expect(blockers(half).map((r: { id: string }) => r.id)).toEqual(['a']);
  });
});

describe('duplicate detector', () => {
  const block = (name: string) =>
    Array.from(
      { length: 12 },
      (_, i) => `  const value${i} = compute(${name === 'x' ? 'input' : 'input'}, ${i}, 'label');`,
    ).join('\n');

  it('finds the same block in two files and ignores comments and imports', () => {
    const a = `import { compute } from './a';\n// first\nexport function one(input: number) {\n${block('x')}\n}\n`;
    const b = `import { compute } from './b';\n/* second */\nexport function two(input: number) {\n${block('y')}\n}\n`;
    const found = findDuplicates([
      { file: 'a.ts', text: a },
      { file: 'b.ts', text: b },
    ]);
    expect(found.clusters).toHaveLength(1);
    expect(found.clusters[0].copies.map((c: { file: string }) => c.file)).toEqual(['a.ts', 'b.ts']);
    expect(found.duplicatedLines).toBeGreaterThan(10);
  });

  it('reports nothing for different code', () => {
    const found = findDuplicates([
      { file: 'a.ts', text: block('x') },
      { file: 'b.ts', text: Array.from({ length: 12 }, (_, i) => `run(${i * 7});`).join('\n') },
    ]);
    expect(found.clusters).toEqual([]);
  });
});

describe('import graph', () => {
  it('finds cycles and counts importers', () => {
    const runtime = new Map([
      ['a', new Set(['b'])],
      ['b', new Set(['c'])],
      ['c', new Set(['a'])],
      ['d', new Set(['a'])],
    ]);
    expect(findCycles(runtime)).toEqual([['a', 'b', 'c']]);
    expect(fanIn(runtime).get('a')).toBe(2);
  });

  it('judges a re-exported name by what imports the barrel', () => {
    const facts = [
      {
        file: 'src/lib.ts',
        exports: [
          { name: 'used', line: 1 },
          { name: 'dead', line: 2 },
          { name: 'viaStar', line: 3 },
        ],
      },
    ];
    const uses = [
      {
        from: 'src/index.ts',
        target: 'src/lib.ts',
        names: ['used'],
        namespace: false,
        reexport: true,
      },
      { from: 'src/index.ts', target: 'src/lib.ts', names: [], namespace: true, reexport: true },
      { from: 'app.ts', target: 'src/index.ts', names: ['used', 'viaStar'], namespace: false },
    ];
    expect(deadExports(facts, uses).map((d: { name: string }) => d.name)).toEqual(['dead']);
    expect(deadExports(facts, [], { isEntry: (f: string) => f === 'src/lib.ts' })).toEqual([]);
  });

  it('resolves relative and workspace imports', () => {
    const repo = memoryRepo({
      'packages/k/package.json': '{"name":"@x/k","exports":"./src/index.ts"}',
      'packages/k/src/index.ts': '',
      'apps/a/src/x.ts': '',
      'apps/a/src/y/index.ts': '',
    });
    const resolveSpec = makeResolver(repo);
    expect(resolveSpec('apps/a/src/z.ts', './x.js')).toBe('apps/a/src/x.ts');
    expect(resolveSpec('apps/a/src/z.ts', './y')).toBe('apps/a/src/y/index.ts');
    expect(resolveSpec('apps/a/src/z.ts', '@x/k')).toBe('packages/k/src/index.ts');
    expect(resolveSpec('apps/a/src/z.ts', 'zod')).toBeNull();
  });
});

describe('syntax facts', () => {
  it('measures function length, nesting, any, non-null assertions and double casts', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'quality-ast-'));
    try {
      mkdirSync(join(dir, 'src'));
      writeFileSync(
        join(dir, 'tsconfig.json'),
        '{"compilerOptions":{"strict":true,"noEmit":true,"types":[]},"include":["src"]}',
      );
      writeFileSync(
        join(dir, 'src/a.ts'),
        [
          "import { b } from './b.js';",
          'export function deep(x: number[], y: any) {',
          '  for (const i of x) {',
          '    if (i) {',
          '      while (i > 1) {',
          '        if (y) {',
          '          switch (i) { case 1: break; }',
          '        }',
          '      }',
          '    } else if (y) {',
          '      b();',
          '    }',
          '  }',
          '  return (y as unknown as string)!;',
          '}',
          'export const small = () => 1;',
        ].join('\n'),
      );
      writeFileSync(join(dir, 'src/b.ts'), 'export function b() {}\nexport { b as c };\n');
      const { facts } = await analyzeProject(dir, (f: string) => f.startsWith('src/'));
      const a = facts.find((f: { file: string }) => f.file === 'src/a.ts');
      const deep = a.functions.find((f: { name: string }) => f.name === 'deep');
      expect(deep.length).toBe(14);
      expect(deep.nesting).toBe(5);
      expect(a.functions.find((f: { name: string }) => f.name === 'small').length).toBe(1);
      expect(a.any).toEqual([2]);
      expect(a.nonNull).toEqual([14]);
      expect(a.unknownCasts).toEqual([14]);
      expect(a.imports).toEqual([
        { spec: './b.js', names: ['b'], namespace: false, typeOnly: false },
      ]);
      expect(a.exports.map((e: { name: string }) => e.name)).toEqual(['deep', 'small']);
      const b = facts.find((f: { file: string }) => f.file === 'src/b.ts');
      expect(b.exports.map((e: { name: string }) => e.name)).toEqual(['b', 'c']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

const failing = (rules: { id: string; penalty: number }[]) =>
  rules.filter((r) => r.penalty > 0).map((r) => r.id);

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
        "await page.waitForTimeout(500);\ntest.skip(!RUN, 'gpu only');\nconst u = 'http://127.0.0.1:4320';\n",
      'tests/aether/b.test.ts':
        "origin: 'http://127.0.0.1:4310';\nawait new Promise((r) => setTimeout(r, 200));\nserver.listen(4999);\nit.skip('later', () => {});\n",
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

  it('finds a disabled control that gives no reason, but accepts title and whyNot', () => {
    const jsx = [
      '<button disabled={!ok} onClick={() => go()}>A</button>',
      '<button disabled={!ok} title="why">B</button>',
      '<button disabled={!ok} {...whyNot(ok, t("x"))}>C</button>',
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

describe('floors and the committed scorecard', () => {
  const report = (score: number, value = 1, status = 'fail') => ({
    overall: score,
    areas: [
      {
        name: 'structure',
        title: 'Structure',
        score,
        measured: 100,
        rules: [
          {
            id: 'r',
            label: 'R',
            status,
            weight: 10,
            value,
            limit: 0,
            full: 10,
            unit: '',
            penalty: 100 - score,
            details: ['a.ts:1'],
          },
        ],
      },
    ],
  });

  it('only raises floors and fails an area below its floor', () => {
    const floors = parseFloors('{"target":95,"floors":{"structure":80}}');
    expect(raiseFloors(floors, report(70)).floors.structure).toBe(80);
    expect(raiseFloors(floors, report(90)).floors.structure).toBe(90);
    expect(floorProblems(report(70), floors)).toEqual(['structure: 70 is below its floor 80']);
    expect(floorProblems(report(80), floors)).toEqual([]);
    expect(floorProblems(report(80), parseFloors(''))[0]).toContain('no floor recorded');
  });

  it('calls a scorecard stale when a measured rule changed, but not when one was not run', () => {
    expect(staleness(report(90), report(90))).toEqual([]);
    expect(staleness(report(90), report(80, 2))[0]).toContain('structure/r');
    expect(staleness(report(90), report(80, 2, 'skipped'))).toEqual([]);
  });

  it('renders the same text for the same report and lists the largest penalties', () => {
    const floors = parseFloors('{"target":95,"floors":{"structure":80}}');
    expect(renderMarkdown(report(90), floors)).toBe(renderMarkdown(report(90), floors));
    expect(renderMarkdown(report(90), floors)).toContain(
      '| Structure (`structure`) | 90.0 | 80.0 |',
    );
    expect(renderTable(report(90), floors, { target: 95 })).toContain('r: R = 1 (limit 0)');
  });
});
