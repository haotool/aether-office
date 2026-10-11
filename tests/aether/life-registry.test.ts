import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EFFECT_IDS } from '../../packages/office-scene/src/life/effects/index.js';
import { LIFE_RULES, ruleOf } from '../../packages/office-scene/src/life/registry.js';
import type { LifeSignal } from '../../packages/office-scene/src/life/signals.js';
import type { CommandTag } from '../../packages/contracts/src/index.js';
import { office } from './life-fixtures.js';

const doc = readFileSync('docs/design/office-life.md', 'utf8');
const tableRows = new Map(
  [...doc.matchAll(/^\| (R\d+) \|(.*)\|$/gm)]
    .map((m) => [m[1]!, m[2]!.split(/(?<!\\)\|/).map((cell) => cell.trim())] as const)
    .filter(([, cells]) => cells.length >= 11),
);

const call = (tool: string, target: string | null): LifeSignal => ({
  kind: 'tool.start',
  member: 'm1',
  at: 0,
  tool,
  target,
});
const fires = (id: string, signal: LifeSignal) => ruleOf(id)!.when(signal, office());

describe('the registry is honest and complete', () => {
  it('labels every rule decorative and gives each an effect, a unique id and a unique spec row', () => {
    expect(LIFE_RULES.every((r) => r.decorative === true)).toBe(true);
    expect(new Set(LIFE_RULES.map((r) => r.id)).size).toBe(LIFE_RULES.length);
    expect(new Set(LIFE_RULES.map((r) => r.row)).size).toBe(LIFE_RULES.length);
    expect([...EFFECT_IDS].sort()).toEqual(LIFE_RULES.map((r) => r.id).sort());
  });

  it('words a result (passed, failed, pushed) only in a rule that claims an outcome, and names the claimers', () => {
    const outcomeWords = /passed|failed|succeeded|exited|pushed|通過|失敗|成功|結束|推送/i;
    for (const r of LIFE_RULES)
      for (const zh of [false, true])
        if (!r.claimsOutcome)
          expect(r.aria('Ada', zh, { kind: 'tool.start', member: 'm1', at: 0 })).not.toMatch(
            outcomeWords,
          );
    expect(LIFE_RULES.filter((r) => r.claimsOutcome).map((r) => r.row)).toEqual([
      'R17',
      'R10',
      'R11',
      'R12',
      'R13',
      'R46',
      'R47',
      'R48',
    ]);
  });

  it('keeps R39 and R40 out: no error text of a fetch exists on real files, so there is no outcome label for them', () => {
    expect(LIFE_RULES.filter((r) => ['R39', 'R40'].includes(r.row))).toEqual([]);
  });

  it('has an aria text in both languages for every rule, and a sane cooldown and duration', () => {
    for (const r of LIFE_RULES) {
      const s: LifeSignal = { kind: 'retry.loop', member: 'm1', at: 0, value: 5 };
      const en = r.aria('Ada', false, s);
      const zh = r.aria('Ada', true, s);
      expect(en.length).toBeGreaterThan(5);
      expect(zh).toMatch(/[一-鿿]/);
      expect(zh).not.toBe(en);
      expect(r.durationMs).toBeGreaterThan(0);
      expect(r.cooldownMs).toBeGreaterThanOrEqual(r.durationMs);
      expect(r.chance).toBeGreaterThan(0);
      expect(r.chance).toBeLessThanOrEqual(1);
    }
  });

  it('matches the spec table: the same rows, the same categories, and a list of what ships', () => {
    for (const rule of LIFE_RULES) {
      const cells = tableRows.get(rule.row);
      expect(cells, `${rule.row} is in the spec table`).toBeDefined();
      expect(cells![7], `${rule.row} category`).toBe(rule.category);
    }
    const listed = [...doc.matchAll(/Implemented in I[68][^:]*: ([^\n]+)/g)].flatMap(
      (m) => m[1]!.match(/R\d+/g) ?? [],
    );
    expect([...new Set(listed)].sort()).toEqual(LIFE_RULES.map((r) => r.row).sort());
  });
});

describe('each rule fires on its trigger and on nothing near it', () => {
  it('R8 rubber duck: a long silence', () => {
    expect(fires('rubber-duck', { kind: 'think.long', member: 'm1', at: 0 })).toBe(true);
    expect(fires('rubber-duck', call('Bash', 'git push'))).toBe(false);
  });
  it('R9 CI lamp: a test command started', () => {
    for (const t of ['pnpm test', 'npm test', 'vitest', 'pytest', 'go test', 'cargo test'])
      expect(fires('ci-lamp', call('Bash', t))).toBe(true);
    for (const t of ['pnpm build', 'git status', 'vim', 'pnpm testing'])
      expect(fires('ci-lamp', call('Bash', t))).toBe(false);
    expect(fires('ci-lamp', call('Read', 'vitest'))).toBe(false);
  });
  it('R14 install hole: an install command', () => {
    for (const t of ['pnpm install', 'npm i', 'npm ci', 'yarn', 'bun add'])
      expect(fires('install-hole', call('Bash', t))).toBe(true);
    expect(fires('install-hole', call('Bash', 'pnpm test'))).toBe(false);
  });
  it('R17 ship it: a push that really exited successfully, never one only started or of unknown outcome', () => {
    const end = (ok: boolean | null, tags: CommandTag[]): LifeSignal => ({
      kind: 'tool.end',
      member: 'm1',
      at: 0,
      tool: 'Bash',
      tags,
      ok,
    });
    expect(fires('ship-it', end(true, ['git.push']))).toBe(true);
    expect(fires('ship-it', end(false, ['git.push']))).toBe(false);
    expect(fires('ship-it', end(null, ['git.push']))).toBe(false);
    expect(fires('ship-it', end(true, ['git.push', 'git.push.force']))).toBe(false);
    expect(fires('ship-it', end(true, ['git.commit']))).toBe(false);
    expect(fires('ship-it', call('Bash', 'git push'))).toBe(false);
  });
  it('R27 pager: an error state', () => {
    expect(fires('pager', { kind: 'activity.error', member: 'm1', at: 0 })).toBe(true);
    expect(fires('pager', { kind: 'idle.long', member: 'm1', at: 0 })).toBe(false);
  });
  it('R32 coffee: long work', () => {
    expect(fires('coffee-refill', { kind: 'work.long', member: 'm1', at: 0 })).toBe(true);
  });
  it('R36 retry loop: the repeat pattern', () => {
    expect(fires('retry-loop', { kind: 'retry.loop', member: 'm1', at: 0, value: 4 })).toBe(true);
  });
  it('R38 Stack Overflow: a fetch of a Q&A host, not a look-alike', () => {
    for (const host of ['stackoverflow.com', 'superuser.com', 'unix.stackexchange.com'])
      expect(fires('ctrl-cv', call('WebFetch', host))).toBe(true);
    for (const host of ['notstackoverflow.com', 'stackoverflow.com.evil.io', 'example.com'])
      expect(fires('ctrl-cv', call('WebFetch', host))).toBe(false);
    expect(fires('ctrl-cv', call('Bash', 'stackoverflow.com'))).toBe(false);
  });
  it('R41 vim trap: vim, vi or nvim as a command', () => {
    for (const t of ['vim', 'vi', 'nvim']) expect(fires('vim-trap', call('Bash', t))).toBe(true);
    expect(fires('vim-trap', call('Edit', 'vim'))).toBe(false);
    expect(fires('vim-trap', call('Bash', 'vimdiff'))).toBe(false);
  });
  it('R44 tech debt: sustained many uncommitted files', () => {
    expect(fires('tech-debt', { kind: 'debt.sustained', member: 'm1', at: 0, value: 30 })).toBe(
      true,
    );
  });
  it('R53 stand-up: idle for a while, on a floor with three idle', () => {
    const idle: LifeSignal = { kind: 'idle.long', member: 'm1', at: 0 };
    expect(fires('standup', idle)).toBe(true);
    expect(ruleOf('standup')!.when(idle, office({ idleOn: () => ['m1', 'm2'] }))).toBe(false);
    expect(ruleOf('standup')!.when(idle, office({ floorOf: () => null }))).toBe(false);
  });
  it("R56 Konami: only the viewer's own code", () => {
    expect(fires('konami', { kind: 'ui.konami', member: null, at: 0 })).toBe(true);
    expect(fires('konami', { kind: 'think.long', member: 'm1', at: 0 })).toBe(false);
  });
});
