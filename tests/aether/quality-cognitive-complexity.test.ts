import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const loadAst = () => import(pathToFileURL(resolve('scripts/quality/ast.mjs')).href);

const FIXTURE = `
export function getWords(n: number) {
  switch (n) {
    case 1: return 'one';
    case 2: return 'a couple';
    case 3: return 'a few';
    default: return 'lots';
  }
}
export function simpleIf(x: boolean) {
  if (x) return 1;
  return 0;
}
export function nestedIf(a: boolean, b: boolean) {
  if (a) {
    if (b) return 1;
  }
  return 0;
}
export function sumOfPrimes(max: number) {
  let total = 0;
  outer: for (let i = 1; i <= max; ++i) {
    for (let j = 2; j < i; ++j) {
      if (i % j === 0) continue outer;
    }
    total += i;
  }
  return total;
}
export function ifElse(x: number) {
  if (x) return 1;
  else return 2;
}
export function andChain(a: boolean, b: boolean, c: boolean, d: boolean) {
  if (a && b && c && d) return 1;
  return 0;
}
export function myMethod(condition1: boolean, condition2: boolean) {
  try {
    if (condition1) {
      for (let i = 0; i < 10; i++) {
        while (condition2) {}
      }
    }
  } catch {
    if (condition2) {}
  }
}
export function mixedLogic(a: boolean, b: boolean, c: boolean, d: boolean) {
  if (a || b && c || d) return 1;
  return 0;
}
export function nullishCoalesce(a: string | null, b: string) {
  return a ?? b;
}
`;

function fixtureProject(extra = '') {
  const dir = mkdtempSync(join(tmpdir(), 'cc-spec-'));
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(
    join(dir, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: { target: 'ES2020', module: 'ESNext', strict: true },
      include: ['src/**/*'],
    }),
  );
  writeFileSync(join(dir, 'src/examples.ts'), FIXTURE + extra);
  return dir;
}

async function cognitiveByName(dir: string, name: string) {
  const { analyzeProject } = await loadAst();
  const { facts } = await analyzeProject(dir, (f: string) => f.endsWith('.ts'));
  const fn = facts
    .flatMap((fact: { functions: { name: string; cognitive: number }[] }) => fact.functions)
    .find((f: { name: string }) => f.name === name);
  expect(fn, `function ${name}`).toBeDefined();
  return fn!.cognitive;
}

describe('Sonar cognitive complexity (white paper v1.7)', () => {
  it('getWords = 1 (switch counts once, not per case)', async () => {
    // SonarSource Cognitive Complexity white paper §Switches / Appendix C
    expect(await cognitiveByName(fixtureProject(), 'getWords')).toBe(1);
  });

  it('simpleIf = 1', async () => {
    expect(await cognitiveByName(fixtureProject(), 'simpleIf')).toBe(1);
  });

  it('nestedIf = 3', async () => {
    expect(await cognitiveByName(fixtureProject(), 'nestedIf')).toBe(3);
  });

  it('sumOfPrimes = 7 (labeled continue adds +1)', async () => {
    // SonarSource Cognitive Complexity white paper §Jumps to labels / Appendix C
    expect(await cognitiveByName(fixtureProject(), 'sumOfPrimes')).toBe(7);
  });

  it('ifElse = 2 (if + else hybrid increments)', async () => {
    // SonarSource Cognitive Complexity white paper Appendix B1 (else)
    expect(await cognitiveByName(fixtureProject(), 'ifElse')).toBe(2);
  });

  it('andChain = 2 (one logic sequence in if condition)', async () => {
    // SonarSource Cognitive Complexity white paper §Sequences of logical operators
    expect(await cognitiveByName(fixtureProject(), 'andChain')).toBe(2);
  });

  it('myMethod = 9 (try/catch nesting example)', async () => {
    // SonarSource Cognitive Complexity white paper §Increment for nested flow-break structures
    expect(await cognitiveByName(fixtureProject(), 'myMethod')).toBe(9);
  });

  it('mixedLogic = 2 (SonarJS 4.2.2: if + one && group; || ignored)', async () => {
    // SonarJS 4.2.2 black-box oracle (differs from white-paper || sequences)
    expect(await cognitiveByName(fixtureProject(), 'mixedLogic')).toBe(2);
  });

  it('nullishCoalesce = 0 (?? ignored; no JS goto/break NUMBER)', async () => {
    // SonarSource Cognitive Complexity white paper §Ignore shorthand (null-coalescing)
    // Labeled break/continue NUMBER not in JS/TS — N/A per language appendix A
    expect(await cognitiveByName(fixtureProject(), 'nullishCoalesce')).toBe(0);
  });

  it('elseIfChain = 3 (else-if flat +1 each; SonarJS 4.2.2)', async () => {
    const extra = `
export function elseIfChain(x: number) {
  if (x === 1) return 'a';
  else if (x === 2) return 'b';
  else if (x === 3) return 'c';
  return 'd';
}
`;
    expect(await cognitiveByName(fixtureProject(extra), 'elseIfChain')).toBe(3);
  });

  it('nestedConstArrow = 1 (outer shell omitted; inner arrow scored; SonarJS 4.2.2)', async () => {
    const extra = `
export function outerShell() {
  const inner = () => { if (true) return 1; return 0; };
  return inner;
}
`;
    const { analyzeProject } = await loadAst();
    const dir = fixtureProject(extra);
    const { facts } = await analyzeProject(dir, (f: string) => f.endsWith('.ts'));
    const fns = facts.flatMap(
      (fact: { functions: { name: string; cognitive: number }[] }) => fact.functions,
    );
    expect(fns.find((f: { name: string }) => f.name === 'outerShell')).toBeUndefined();
    expect(fns.find((f: { name: string }) => f.name === 'inner')?.cognitive).toBe(1);
  });

  it('mapCallback = 1 (call argument arrow is its own unit; SonarJS 4.2.2)', async () => {
    const extra = `
export function useMap(arr: number[]) {
  return arr.map((n) => { if (n) return n; return 0; });
}
`;
    const { analyzeProject } = await loadAst();
    const dir = fixtureProject(extra);
    const { facts } = await analyzeProject(dir, (f: string) => f.endsWith('.ts'));
    const fns = facts.flatMap(
      (fact: { functions: { name: string; cognitive: number }[] }) => fact.functions,
    );
    expect(fns.find((f: { name: string }) => f.name === 'useMap')).toBeUndefined();
    const anon = fns.find((f: { name: string }) => f.name === '(anonymous)');
    expect(anon?.cognitive).toBe(1);
  });

  it('elseIfThenInnerIf = 5 (else-if chain; inner if in last arm; SonarJS 4.2.2)', async () => {
    const extra = `
export function elseIfThenInnerIf(a: boolean) {
  if (false) {}
  else if (false) {}
  else if (a) { if (a) {} }
}
`;
    expect(await cognitiveByName(fixtureProject(extra), 'elseIfThenInnerIf')).toBe(5);
  });

  it('elseIfChainElseLoneIf = 5 (no +1 for else { if } after else-if; SonarJS 4.2.2)', async () => {
    const extra = `
export function elseIfChainElseLoneIf(a: boolean) {
  if (false) {}
  else if (false) {}
  else { if (a) {} }
}
`;
    expect(await cognitiveByName(fixtureProject(extra), 'elseIfChainElseLoneIf')).toBe(5);
  });

  it('ternaryWithAndInConst = 2 (no duplicate && on const walk; SonarJS 4.2.2)', async () => {
    const extra = `
export function ternaryWithAndInConst(a: boolean, b: boolean, c: string) {
  const n = { p: a && b ? 'x' : c };
}
`;
    expect(await cognitiveByName(fixtureProject(extra), 'ternaryWithAndInConst')).toBe(2);
  });

  it('describeItNested = 1 (only describe callback; it suppressed; SonarJS 4.2.2)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-describe-'));
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { target: 'ES2020', module: 'ESNext', strict: true },
        include: ['src/**/*'],
      }),
    );
    writeFileSync(
      join(dir, 'src/suite.test.ts'),
      `import { describe, it } from 'vitest';
describe('suite', () => {
  it('case', () => { if (1) return; });
});
`,
    );
    const { analyzeProject } = await loadAst();
    const { facts } = await analyzeProject(dir, (f: string) => f.endsWith('.ts'));
    expect(facts.flatMap((fact: { functions: unknown[] }) => fact.functions)).toHaveLength(1);
    rmSync(dir, { recursive: true, force: true });
  });
});
