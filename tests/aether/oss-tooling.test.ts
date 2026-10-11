import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { lib, PERSON, scratch, git, syntheticRepo } from './oss-tooling-env.js';

describe('pattern matching', () => {
  const rules = lib.BUILT_IN_RULES;

  it('flags personal home directories and ignores placeholders', () => {
    const text = [
      `/Users/${PERSON}/code`,
      `C:\\\\Users\\\\${PERSON}\\\\x`,
      `/home/${PERSON}/x`,
      '/Users/dev/ok',
      '/Users/sam/ok',
      '/home/runner/work',
    ].join('\n');
    const found = lib.scanText(text, rules).map((f: { line: number }) => f.line);
    expect(found).toEqual([1, 2, 3]);
  });

  it('keeps LAN addresses and local host names to documentation only', () => {
    expect(lib.scanText('ip 192.168.1.20 at office.lan', rules)).toEqual([]);
    const docs = lib.scanText('ip 192.168.1.20 at office.lan', rules, { docs: true });
    expect(docs.map((f: { rule: string }) => f.rule).sort()).toEqual(['hostname', 'lan-address']);
  });

  it('flags machine host names and redacts token samples', () => {
    expect(lib.scanText("on Jane's-MacBook-Pro", rules)).toHaveLength(1);
    const fakeToken = `ghp_${'a1B2'.repeat(10)}`;
    const [hit] = lib.scanText(`token=${fakeToken}`, lib.TOKEN_RULES);
    expect(hit.sample).not.toContain(fakeToken);
    expect(hit.sample.startsWith('ghp_')).toBe(true);
  });

  it('parses private patterns, hides the matched text and builds replacement rules', () => {
    const parsed = lib.parsePrivatePatterns(
      '# c\njane.doe ==> dev\nre:jane[._-]?doe@\\S+ ==> user@example.com\n\n',
    );
    expect(parsed.map((p: { replacement: string }) => p.replacement)).toEqual([
      'dev',
      'user@example.com',
    ]);
    const [hit] = lib.scanText('written by JANE.DOE', parsed);
    expect(hit.sample).toBe('(private pattern)');
    const rules = lib.replaceRules(parsed);
    expect(rules).toHaveLength(4);
    const home = new RegExp(rules[0].re, 'g');
    expect(`/Users/${PERSON}/a /Users/a/b`.replace(home, rules[0].rep)).toBe(
      '/Users/dev/a /Users/a/b',
    );
  });
});

describe('subjects', () => {
  it('leaves short subjects alone and shortens long ones at a clause boundary', () => {
    expect(lib.shortenSubject('fix: small')).toBe('fix: small');
    const long =
      'feat(web): opt-in LAN access (AETHER_HOST) for phones and tablets: private-network Host/Origin allow-list that still refuses public names';
    const short = lib.shortenSubject(long);
    expect(short).toBe('feat(web): opt-in LAN access (AETHER_HOST) for phones and tablets');
    expect(short.length).toBeLessThanOrEqual(72);
  });

  it('never ends on a dangling word or an open parenthesis', () => {
    const short = lib.shortenSubject(
      'fix: restore the original dependency-policy tests that the previous commit overwrote and add checks',
    );
    expect(short.length).toBeLessThanOrEqual(72);
    expect(short).not.toMatch(/\s(?:the|and|that|a|of)$/);
    const paren = lib.shortenSubject(
      `feat: ${'word '.repeat(10)}(an aside that runs on and on and on and on and on)`,
    );
    expect(paren.length).toBeLessThanOrEqual(72);
    expect((paren.match(/\(/g) ?? []).length).toBe((paren.match(/\)/g) ?? []).length);
  });

  it('keeps the full original subject in the body and names merges after their topic', () => {
    const message = lib.rewriteMessage(
      'feat: short',
      'feat: short and then a very long tail that was cut\n\nbody text',
    );
    expect(message).toBe(
      'feat: short\n\nfeat: short and then a very long tail that was cut\n\nbody text\n',
    );
    expect(lib.mergeSubject('feat(web): schedules section in settings')).toBe(
      'chore: merge schedules section in settings',
    );
    expect(lib.stripTrailers('feat: x\n\nbody\n\nCo-Authored-By: Someone <s@example.com>\n')).toBe(
      'feat: x\n\nbody\n',
    );
  });

  it('tells the lines an AI tool added from the trailers of human co-authors', () => {
    const session = 'feat: x\n\nbody\n\nClaude-Session: https://claude.example/code/session_1\n';
    const assistant = 'feat: x\n\nCo-authored-by: Claude Opus 5.5 <noreply@anthropic.com>\n';
    const person = 'feat: x\n\nCo-authored-by: Real Person <real@example.com>\n';
    expect(lib.hasToolTrailers(session)).toBe(true);
    expect(lib.hasToolTrailers(assistant)).toBe(true);
    expect(lib.hasToolTrailers(person)).toBe(false);
    expect(lib.hasToolTrailers('feat: x\n\nbody mentions Claude Code and anthropic.com\n')).toBe(
      false,
    );
  });
});

describe('milestone grouping', () => {
  const unit = (i: number, subject: string, day: string, pinned = false) => ({
    pinned,
    type: 'feat',
    scope: '',
    subject,
    day,
    index: i,
  });
  const units = Array.from({ length: 60 }, (_, i) =>
    unit(
      i,
      i < 20 ? 'phone layout' : i < 40 ? 'camera for the 3d scene' : 'approval hardening',
      `2026-01-${String(1 + Math.floor(i / 10)).padStart(2, '0')}`,
      i === 30,
    ),
  );

  it('is deterministic, ordered, complete and never merges a pinned unit', () => {
    const first = lib.groupUnits(units, { target: 6 });
    expect(JSON.stringify(lib.groupUnits(units, { target: 6 }))).toBe(JSON.stringify(first));
    expect(first.flatMap((g: { indexes: number[] }) => g.indexes)).toEqual(units.map((_, i) => i));
    const pinned = first.find((g: { pinned: boolean }) => g.pinned);
    expect(pinned.indexes).toEqual([30]);
    expect(first.length).toBeGreaterThanOrEqual(5);
    expect(first.length).toBeLessThanOrEqual(8);
  });

  it('cuts where the theme changes', () => {
    const groups = lib.groupUnits(
      units.filter((u) => !u.pinned),
      { target: 3 },
    );
    const themes = groups.map((g: { themes: { id: string }[] }) => g.themes[0]?.id);
    expect(themes).toEqual(['phone', 'scene', 'security']);
  });
});

describe('safety', () => {
  it('refuses the working checkout and a plain repository', () => {
    expect(() => lib.assertThrowawayClone(process.cwd())).toThrow(/not a throwaway clone/);
    const plain = join(scratch, 'plain');
    mkdirSync(plain);
    git(plain, ['init', '-q']);
    expect(() => lib.assertThrowawayClone(plain)).toThrow(/not a throwaway clone/);
  });

  it('accepts a marked clone, but not one that still has an origin', () => {
    const dir = join(scratch, 'marked');
    mkdirSync(dir);
    git(dir, ['init', '-q']);
    writeFileSync(join(dir, '.git', lib.CLONE_MARKER), '{"source":"/nowhere"}');
    expect(lib.assertThrowawayClone(dir).source).toBe('/nowhere');
    git(dir, ['remote', 'add', 'origin', 'https://example.invalid/x.git']);
    expect(() => lib.assertThrowawayClone(dir)).toThrow(/remote origin/);
  });

  it('refuses an output directory that exists with content or sits inside the source', () => {
    const source = syntheticRepo('src-guard');
    expect(() => lib.assertFreshOutput(source, source)).toThrow(/not empty/);
    expect(() => lib.assertFreshOutput(join(source, 'inside'), source)).toThrow(
      /inside the source/,
    );
    expect(() => lib.assertFreshOutput(join(scratch, 'fresh-out'), source)).not.toThrow();
  });
});
