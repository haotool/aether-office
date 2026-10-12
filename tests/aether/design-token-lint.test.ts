import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const { RULES, declarations, mediaViolations, regressions, tally, violationsIn } = await import(
  pathToFileURL(resolve('scripts/design-token-rules.mjs')).href
);

const rulesBroken = (css: string) =>
  violationsIn(css).map((v: { rule: string }) => v.rule) as string[];

describe('design token rules: each one has CSS it allows and CSS it rejects', () => {
  const cases: Record<string, { ok: string[]; bad: string[] }> = {
    'literal-size': {
      ok: [
        'width: 100%;',
        'height: 1px;',
        'width: 0;',
        'height: var(--control-h-md);',
        'min-height: calc(var(--bar-h) + var(--safe-top));',
        'inset: 0;',
        'width: auto;',
        'padding: 12px;',
      ],
      bad: [
        'height: 36px;',
        'min-width: 160px;',
        'max-height: calc(100dvh - 48px);',
        'top: 14px;',
        'inset: 8px;',
        'width: min(260px, 100%);',
      ],
    },
    'viewport-height': {
      ok: ['height: 100dvh;', 'height: 60svh;', 'width: 50vw;'],
      bad: ['height: 60vh;', 'max-height: 50.5vh;'],
    },
    'literal-duration': {
      ok: [
        'transition: color var(--dur) var(--ease);',
        'animation: spin var(--dur-slow) linear;',
        'transition: none;',
        'animation: pulse var(--dur) steps(2);',
      ],
      bad: [
        'transition: transform 0.15s;',
        'animation: fade 1.8s ease infinite;',
        'transition-duration: 200ms;',
        'animation-delay: 3s;',
      ],
    },
    'literal-shadow': {
      ok: ['box-shadow: var(--shadow-md);', 'box-shadow: none;', 'text-shadow: none;'],
      bad: [
        'box-shadow: 0 4px 16px var(--shade);',
        'text-shadow: 0 0 8px var(--glow);',
        'box-shadow: inset 0 0 0 1px var(--line);',
      ],
    },
    'literal-line-height': {
      ok: ['line-height: var(--lh-body);', 'line-height: inherit;', 'line-height: normal;'],
      bad: ['line-height: 1.25;', 'line-height: 20px;', 'line-height: 1;'],
    },
    important: {
      ok: ['color: var(--text);'],
      bad: ['display: none !important;'],
    },
    'custom-property-literal': {
      ok: ['--inset: var(--space-12);', '--lift: 0;'],
      bad: ['--tabbar-h: 56px;', '--gap: 12px;'],
    },
  };

  for (const [rule, { ok, bad }] of Object.entries(cases)) {
    it(`${rule} allows ${ok.length} and rejects ${bad.length}`, () => {
      for (const css of ok) expect(rulesBroken(`.a {\n  ${css}\n}`), css).not.toContain(rule);
      for (const css of bad) expect(rulesBroken(`.a {\n  ${css}\n}`), css).toContain(rule);
    });
  }

  it('has a case for every declaration rule', () => {
    expect(Object.keys(cases).sort()).toEqual(Object.keys(RULES).sort());
  });
});

describe('media queries', () => {
  const widths = (css: string) => mediaViolations(css).map((m: { text: string }) => m.text);

  it('allows the four canonical values, their min- partners and the documented exceptions', () => {
    for (const q of [
      '@media (max-width: 760px) {',
      '@media (min-width: 761px) and (max-width: 1000px) {',
      '@media (max-width: 1250px) {',
      '@media (min-width: 1251px) {',
      '@media (pointer: coarse) and (max-height: 500px) {',
      '@media (min-width: 1800px) {',
      '@media (max-width: 1500px) {',
      '@media (hover: hover) {',
      '@media (prefers-reduced-motion: reduce) {',
      '@media (forced-colors: active) {',
    ])
      expect(widths(`${q}\n}`), q).toEqual([]);
  });

  it('rejects any other pixel width or height', () => {
    for (const q of [
      '@media (max-width: 960px) {',
      '@media (max-width: 1100px) {',
      '@media (min-width: 480px) {',
      '@media (max-height: 640px) {',
    ])
      expect(widths(`${q}\n}`), q).toEqual([q]);
  });

  it('is not a media query when it is a container query', () => {
    expect(widths('@container panel (max-width: 359px) {\n}')).toEqual([]);
  });
});

describe('the escape hatch', () => {
  it('exempts a line that says why, and only that line', () => {
    const css = ['.a {', '  width: 52px; /* token-lint: geometry */', '  height: 52px;', '}'].join(
      '\n',
    );
    expect(violationsIn(css)).toEqual([{ rule: 'literal-size', line: 3, text: 'height: 52px' }]);
  });

  it('works inside an existing trailing comment', () => {
    const css = '.a {\n  animation: spin 2s linear infinite; /* a slow loop token-lint: loop */\n}';
    expect(violationsIn(css)).toEqual([]);
  });

  it('exempts an @media line too', () => {
    expect(mediaViolations('@media (max-width: 333px) { /* token-lint: exception */')).toEqual([]);
  });

  it('leaves tokens.css alone: it is where raw values live', () => {
    expect(violationsIn('--a: 12px;\nwidth: 99px;', { tokens: true })).toEqual([]);
    expect(violationsIn('--a: 12px;')).toHaveLength(1);
  });
});

describe('declarations', () => {
  it('reads a property, a value without its trailing comment, and the line', () => {
    expect(declarations('a {\n  color: red; /* note */\n}')).toEqual([
      { property: 'color', value: 'red', line: 2, escaped: false },
    ]);
  });
});

describe('the baseline', () => {
  const sources = (width: string) => [
    { file: 'a.css', text: `.a {\n  width: ${width};\n  height: 40px;\n}` },
    { file: 'b.css', text: '.b {\n  color: red;\n}' },
  ];

  it('counts per rule and per file', () => {
    const { counts, files } = tally(sources('30px'));
    expect(counts['literal-size']).toBe(2);
    expect(files['literal-size']).toEqual({ 'a.css': 2 });
  });

  it('passes when nothing got worse and when counts went down', () => {
    const base = tally(sources('30px'));
    expect(regressions(base, tally(sources('30px')))).toEqual([]);
    expect(regressions(base, tally(sources('100%')))).toEqual([]);
  });

  it('prints the rule and the file when a count goes up', () => {
    const base = tally(sources('100%'));
    expect(regressions(base, tally(sources('30px')))).toEqual([
      'literal-size: 1 -> 2',
      '  a.css: literal-size 1 -> 2',
    ]);
  });

  it('fails a new file with violations even when the total is unchanged elsewhere', () => {
    const base = tally(sources('30px'));
    const next = tally([...sources('100%'), { file: 'c.css', text: '.c {\n  width: 20px;\n}' }]);
    expect(regressions(base, next)).toContain('  c.css: literal-size 0 -> 1');
  });
});

describe('the repository', () => {
  it('has no strict violation above scripts/design-token-baseline.json', () => {
    const out = execFileSync(process.execPath, ['scripts/check-design-tokens.mjs'], {
      encoding: 'utf8',
    });
    expect(out).toContain('none above the baseline');
  });
});
