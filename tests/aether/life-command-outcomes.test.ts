import { describe, expect, it } from 'vitest';
import { COMMAND_TAGS } from '../../packages/providers/src/command-tags.mjs';
import type { CommandTag } from '../../packages/contracts/src/index.js';
import { fridayAfternoon } from '../../packages/office-scene/src/life/matchers.js';
import { LIFE_RULES, ruleOf } from '../../packages/office-scene/src/life/registry.js';
import { emptyLifeState, schedule } from '../../packages/office-scene/src/life/schedule.js';
import type { LifeSignal, SignalKind } from '../../packages/office-scene/src/life/signals.js';
import { env, loud, office } from './life-fixtures.js';

const NOW = 1_000_000_000;
const TAGS = COMMAND_TAGS as readonly CommandTag[];
const fires = (id: string, signal: LifeSignal) => ruleOf(id)!.when(signal, office());
const start = (tags: CommandTag[], at = NOW): LifeSignal => ({
  kind: 'tool.start',
  member: 'm1',
  at,
  tool: 'Bash',
  tags,
});
const end = (tags: CommandTag[], ok: boolean | null): LifeSignal => ({
  kind: 'tool.end',
  member: 'm1',
  at: NOW,
  tool: 'Bash',
  tags,
  ok,
});
const certain = LIFE_RULES.map((r) => ({ ...r, chance: 1 }));
const started = (signals: readonly LifeSignal[], now = NOW) =>
  schedule(emptyLifeState, signals, now, loud, office(), { ...env, rules: certain }).started.map(
    (c) => c.rule,
  );

describe('command outcome rows read a real outcome and nothing else', () => {
  it('R10 and R11: a test run that really passed shows the pass, one that really failed shows the fail, never both', () => {
    expect(started([end(['test'], true)])).toEqual(['ci-pass']);
    expect(started([end(['test'], false)])).toEqual(['ci-fail']);
  });

  it('shows no outcome effect, whatever the tag, when the outcome is not known (null, missing or only a start)', () => {
    for (const tag of TAGS) {
      expect(started([end([tag], null)]), `${tag} with ok null`).toEqual([]);
      const missing: LifeSignal = { kind: 'tool.end', member: 'm1', at: NOW, tags: [tag] };
      expect(started([missing]), `${tag} with no ok`).toEqual([]);
      for (const rule of LIFE_RULES.filter((r) => r.claimsOutcome))
        expect(rule.when(start([tag]), office()), `${rule.id} on a start of ${tag}`).toBe(false);
    }
  });

  it('never lets a rule that claims an outcome through on a signal that carries none, even if its matcher would', () => {
    const lax = LIFE_RULES.filter((r) => r.claimsOutcome).map((r) => ({
      ...r,
      chance: 1,
      when: () => true,
    }));
    const r = schedule(emptyLifeState, [end(['test'], null)], NOW, loud, office(), {
      ...env,
      rules: lax,
    });
    expect(r.started).toEqual([]);
  });

  it('R12: a CI watch that exited, green or red, worded as the command exit status, never as CI passing', () => {
    expect(fires('ci-stack', end(['ci.watch'], true))).toBe(true);
    expect(fires('ci-stack', end(['ci.watch'], false))).toBe(true);
    const aria = (ok: boolean) => ruleOf('ci-stack')!.aria('Ada', false, end(['ci.watch'], ok));
    expect(aria(true)).toBe("Ada's CI watch command exited successfully");
    expect(aria(false)).toBe("Ada's CI watch command exited with an error");
    expect(aria(true)).not.toMatch(/CI (passed|checks)/i);
  });

  it('R13: only a build or typecheck that really failed', () => {
    expect(fires('build-error', end(['build'], false))).toBe(true);
    expect(fires('build-error', end(['typecheck'], false))).toBe(true);
    expect(fires('build-error', end(['build'], true))).toBe(false);
    expect(fires('build-error', end(['lint'], false))).toBe(false);
  });

  it('R17: a push that exited successfully; a failed push, a force push and a bare start show no ship-it', () => {
    expect(started([end(['git.push'], true)])).toEqual(['ship-it']);
    expect(started([end(['git.push'], false)])).toEqual([]);
    expect(started([start(['git.push'])])).toEqual([]);
    expect(started([end(['git.push', 'git.push.force'], true)])).toEqual([]);
  });

  it('R48: an approve command that exited successfully, never a failed or unknown one', () => {
    expect(started([end(['gh.pr.approve'], true)])).toEqual(['lgtm']);
    expect(started([end(['gh.pr.approve'], false)])).toEqual([]);
    expect(started([end(['gh.pr.approve'], null)])).toEqual([]);
  });

  it('R46 and R47: only the web-derived patterns, which are made of real outcomes', () => {
    const pattern = (kind: SignalKind): LifeSignal => ({
      kind,
      member: 'm1',
      at: NOW,
      ok: kind === 'tests.edited',
    });
    expect(started([pattern('tests.machine')])).toEqual(['works-machine']);
    expect(started([pattern('tests.edited')])).toEqual(['not-a-bug']);
    expect(started([end(['test'], false)])).not.toContain('works-machine');
  });
});

describe('command outcome rows: rows that start from what a command was started as', () => {
  it('R18 force push: the force tag on a start, not a plain push', () => {
    expect(started([start(['git.push', 'git.push.force'])])).toEqual(['force-push']);
    expect(started([start(['git.push'])])).toEqual([]);
  });

  it('R19 merge conflict: conflicted files appeared, or a conflict-marker search started', () => {
    const files: LifeSignal = { kind: 'git.conflicts', member: 'm1', at: NOW, value: 3 };
    expect(started([files])).toEqual(['merge-conflict']);
    expect(started([start(['git.conflict.marker'])])).toEqual(['merge-conflict']);
    expect(ruleOf('merge-conflict')!.aria('Ada', false, files)).toBe(
      "Ada's repository has 3 conflicted files",
    );
    expect(started([start(['git.merge'])])).toEqual([]);
  });

  it('R22 launch pad: a deploy, publish or release command started', () => {
    for (const tag of ['deploy', 'publish', 'release'] as const)
      expect(started([start([tag])])).toEqual(['launch-pad']);
    expect(started([start(['build'])])).toEqual([]);
  });

  it('R25 skull: a recursive delete started, worded as started and nothing more', () => {
    expect(started([start(['fs.rm.recursive'])])).toEqual(['skull-gag']);
    for (const zh of [false, true])
      expect(ruleOf('skull-gag')!.aria('Ada', zh, start(['fs.rm.recursive']))).not.toMatch(
        /deleted|removed|executed|ran|blocked|刪除了|已刪|已執行|阻擋/i,
      );
  });

  it('R59 sudo and R60 curl | sh: the tags, as a start', () => {
    expect(started([start(['sudo'])])).toEqual(['sudo-prompt']);
    expect(started([start(['curl.pipe'])])).toEqual(['curl-pipe']);
    expect(started([end(['sudo'], true)])).toEqual([]);
  });
});

describe('command outcome rows: Friday deploy uses the viewer clock', () => {
  const local = (day: number, hour: number) => new Date(2026, 9, day, hour, 30).getTime();

  it('is Friday from 15:00 on, in local time, and no other day or hour', () => {
    expect(fridayAfternoon(local(9, 15))).toBe(true);
    expect(fridayAfternoon(local(9, 23))).toBe(true);
    expect(fridayAfternoon(local(9, 14))).toBe(false);
    expect(fridayAfternoon(local(8, 16))).toBe(false);
    expect(fridayAfternoon(local(10, 16))).toBe(false);
  });

  it('puts the Friday sign over the plain launch pad, on a deploy tag only', () => {
    expect(started([start(['deploy'], local(9, 16))], local(9, 16))).toEqual(['friday-deploy']);
    expect(started([start(['deploy'], local(8, 16))], local(8, 16))).toEqual(['launch-pad']);
    expect(started([start(['sudo'], local(9, 16))], local(9, 16))).toEqual(['sudo-prompt']);
  });
});
