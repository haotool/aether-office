import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeProject,
  deadExports,
  fanIn,
  findCycles,
  findDuplicates,
  makeResolver,
  memoryRepo,
  overall,
  rule,
  scoreArea,
  skipped,
  info,
  blockers,
} from './quality-score-shared.js';

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
