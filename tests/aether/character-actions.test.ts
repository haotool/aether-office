import { describe, expect, it } from 'vitest';
import {
  ACTION_IDS,
  REASONS,
  actionsFor,
  groupActions,
  stopRoute,
  type ActionId,
  type CharacterFacts,
  type Reason,
} from '../../apps/web/src/features/character-actions.js';
import { en } from '../../apps/web/src/locales/en.js';
import { zh } from '../../apps/web/src/locales/zh.js';

const base: CharacterFacts = {
  kind: 'observed',
  role: 'owner',
  process: 'running',
  liveness: 'active',
  drive: 'none',
  working: false,
  profile: true,
  clockOut: false,
  leaving: false,
  following: false,
  pinned: false,
  wall: true,
};
const facts = (change: Partial<CharacterFacts>): CharacterFacts => ({ ...base, ...change });

/** The state of every action as `id` (enabled) or `!id:reason` (disabled), the way the table below reads. */
const read = (f: CharacterFacts) =>
  Object.fromEntries(
    actionsFor(f).map((a) => [a.id, a.enabled ? 'on' : (a.reason ?? 'disabled without a reason')]),
  ) as Partial<Record<ActionId, string>>;

describe('which actions a character really has', () => {
  // [case, facts, what each action should be: only the ones that differ from "on" or are asserted]
  const table: [string, Partial<CharacterFacts>, Partial<Record<ActionId, string>>][] = [
    [
      'a session AETHER only observes (read-only): continue instead of a message box, nothing is typed into it',
      {},
      {
        message: undefined, // not offered
        continue: 'reasonRunningElsewhere',
        replies: 'reasonReadOnly',
        interrupt: 'reasonReadOnly',
        copy_resume: 'on',
        fork: 'on',
        stop: 'reasonActive',
      },
    ],
    [
      'an observed session that has ended can be continued',
      { process: 'none', liveness: 'ended' },
      { continue: 'on', replies: 'reasonEnded', interrupt: 'reasonEnded', stop: 'reasonEnded' },
    ],
    [
      'an observed session with no terminal profile cannot be continued or forked',
      { process: 'none', liveness: 'ended', profile: false },
      { continue: 'reasonNoProfile', fork: 'reasonNoProfile' },
    ],
    [
      'a drivable session that is idle: message and quick replies, no interrupt',
      { drive: 'free' },
      {
        message: 'on',
        continue: undefined,
        replies: 'on',
        interrupt: 'reasonIdle',
        stop: 'on',
        fork: 'on',
      },
    ],
    [
      'a drivable session that is working: it can be interrupted, not messaged',
      { drive: 'free', working: true, liveness: 'active' },
      { message: 'reasonWorking', replies: 'reasonWorking', interrupt: 'on', stop: 'on' },
    ],
    [
      'a drivable session whose terminal another person holds',
      { drive: 'held', working: true },
      { message: 'reasonHeld', replies: 'reasonHeld', interrupt: 'reasonHeld', stop: 'reasonHeld' },
    ],
    [
      'a drivable session whose terminal has stopped',
      { drive: 'stopped' },
      { message: 'reasonTerminalStopped', interrupt: 'reasonTerminalStopped' },
    ],
    [
      'an operator drives and stops its terminal but cannot end a forgotten process',
      { role: 'operator', drive: 'free', working: true },
      { message: 'reasonWorking', interrupt: 'on', stop: 'on' },
    ],
    [
      'an operator cannot stop a forgotten process (owner only)',
      { role: 'operator', liveness: 'dormant' },
      { stop: 'reasonOwner', continue: 'reasonRunningElsewhere', fork: 'on' },
    ],
    [
      'a viewer can look and copy, and nothing else',
      { role: 'viewer', drive: 'free', working: true },
      {
        open: 'on',
        follow: 'on',
        screen: 'on',
        message: 'reasonViewer',
        replies: 'reasonViewer',
        interrupt: 'reasonViewer',
        copy_resume: 'on',
        fork: 'reasonViewer',
        stop: 'reasonViewer',
        pin: 'on',
        feed: 'on',
      },
    ],
    [
      'a forgotten (dormant) session the owner may stop',
      { liveness: 'dormant' },
      { stop: 'on', send_home: undefined },
    ],
    ['an orphaned session is stoppable too', { liveness: 'orphaned' }, { stop: 'on' }],
    [
      'a clock-out candidate offers Send home in place of Stop (owner only)',
      { liveness: 'dormant', clockOut: true },
      { send_home: 'on', stop: undefined },
    ],
    [
      'a clock-out candidate seen by an operator: Send home is listed, disabled',
      { role: 'operator', liveness: 'dormant', clockOut: true },
      { send_home: 'reasonOwner' },
    ],
    [
      'a managed agent has no terminal and no resume command',
      { kind: 'managed', process: null, liveness: null },
      {
        message: 'reasonManaged',
        replies: 'reasonManaged',
        copy_resume: 'reasonManaged',
        fork: 'reasonManaged',
        interrupt: 'reasonManaged',
        stop: 'reasonManaged',
        open: 'on',
        screen: 'on',
      },
    ],
    [
      'a subagent speaks through its parent',
      { kind: 'subagent', process: null, liveness: null },
      {
        message: 'reasonSubagent',
        copy_resume: 'reasonSubagent',
        stop: 'reasonSubagent',
        feed: 'on',
      },
    ],
    [
      'a member walking out cannot be followed or looked at',
      { leaving: true },
      { follow: 'reasonLeaving', screen: 'reasonLeaving' },
    ],
    [
      'unfollowing is always possible, even while it leaves',
      { leaving: true, following: true },
      { follow: 'on' },
    ],
    ['pinning needs room on the wall', { wall: false }, { pin: 'reasonNoWall' }],
    ['a pinned member can always be unpinned', { wall: false, pinned: true }, { pin: 'on' }],
  ];

  it.each(table)('%s', (_name, change, expected) => {
    const actual = read(facts(change));
    for (const [id, want] of Object.entries(expected) as [ActionId, string | undefined][]) {
      if (want === undefined) expect(actual[id], id).toBeUndefined();
      else expect(actual[id], id).toBe(want);
    }
  });

  it('marks the toggles that are on', () => {
    const list = actionsFor(facts({ following: true, pinned: true }));
    expect(list.find((a) => a.id === 'follow')!.on).toBe(true);
    expect(list.find((a) => a.id === 'pin')!.on).toBe(true);
    expect(list.find((a) => a.id === 'screen')!.on).toBeUndefined();
  });

  it('lists every disabled action with a reason, in a fixed order, and never both message and continue', () => {
    for (const f of [
      facts({}),
      facts({ drive: 'free' }),
      facts({ kind: 'managed' }),
      facts({ role: 'viewer' }),
    ]) {
      const list = actionsFor(f);
      expect(list.filter((a) => !a.enabled).every((a) => a.reason)).toBe(true);
      const ids = list.map((a) => a.id);
      expect(ids.filter((id) => id === 'message' || id === 'continue')).toHaveLength(1);
      expect(ids).toEqual(ACTION_IDS.filter((id) => ids.includes(id)));
    }
  });

  it('every reason has words in both languages', () => {
    for (const reason of REASONS as readonly Reason[]) {
      expect(en[reason], reason).toBeTruthy();
      expect(zh[reason], reason).toBeTruthy();
    }
  });

  it('stops a session through its AETHER terminal, or its process when it is forgotten and the owner asks', () => {
    expect(stopRoute(facts({ drive: 'free', role: 'operator' }))).toBe('terminal');
    expect(stopRoute(facts({ liveness: 'dormant' }))).toBe('process');
    expect(stopRoute(facts({ liveness: 'dormant', role: 'operator' }))).toBeNull();
    expect(stopRoute(facts({ liveness: 'active' }))).toBeNull();
    expect(stopRoute(facts({ kind: 'managed' }))).toBeNull();
  });
});

describe('what the group bar offers', () => {
  const m = (hasSession: boolean, clockOut: boolean) => ({ hasSession, clockOut });
  it('sends home only the clock-out candidates, and only for an owner', () => {
    expect(
      groupActions([m(true, true), m(true, false), m(true, true)], 'owner', true).sendHome,
    ).toEqual({
      count: 2,
    });
    expect(groupActions([m(true, true)], 'operator', true).sendHome).toEqual({
      count: 0,
      reason: 'reasonOwner',
    });
    expect(groupActions([m(true, false)], 'owner', true).sendHome).toEqual({
      count: 0,
      reason: 'reasonActive',
    });
  });
  it('copies resume commands for the sessions among them, and pins only when the wall has room', () => {
    const picked = [m(true, false), m(false, false)];
    expect(groupActions(picked, 'viewer', true).copy.count).toBe(1);
    expect(groupActions(picked, 'viewer', false).pin).toEqual({ reason: 'reasonNoWall' });
    expect(groupActions(picked, 'viewer', true).pin).toEqual({});
  });
});
