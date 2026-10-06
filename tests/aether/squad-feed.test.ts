import { describe, expect, it } from 'vitest';
import type { Agent, AttributedSession, Subagent } from '../../packages/contracts/src/index.js';
import { buildFeed, feedItems } from '../../apps/web/src/features/feed-model.js';
import {
  SQUAD_FADE_AFTER_MS,
  SQUAD_FOLD_ABOVE,
  SQUAD_GRACE_MS,
  SQUAD_HUES,
  callsOf,
  elapsedLabel,
  groupFeed,
  snapshotOf,
  squadAccentOf,
  squadChange,
  squadHue,
  squadViewOf,
} from '../../apps/web/src/features/feed-squads.js';
import {
  isSquadOpen,
  parseSquadOpen,
  withSquadOpen,
} from '../../apps/web/src/features/squad-open.js';
import { fmt, squadSummary, toolsText } from '../../apps/web/src/features/squad-text.js';
import { treeNav } from '../../apps/web/src/features/tree-nav.js';

const NOW = Date.parse('2026-10-07T12:00:00Z');
const SEC = 1000;

function sub(id: string, over: Partial<Subagent> = {}): Subagent {
  return {
    id,
    type: 'Explore',
    lastSeen: NOW - 5 * SEC,
    source: 'hook',
    status: 'running',
    startedAt: NOW - 60 * SEC,
    endedAt: null,
    nickname: null,
    tools: { count: 3, last: 'Read', lastAt: NOW - 5 * SEC },
    label: null,
    tokens: null,
    result: null,
    ...over,
  };
}

function session(key: string, subagents: Subagent[], over: Partial<AttributedSession> = {}) {
  return {
    key,
    provider: 'claude',
    sessionId: key.split(':')[1]!,
    cwd: '/work/aether',
    repo: 'aether',
    mtime: NOW - 5 * SEC,
    git: null,
    worktree: null,
    hook: null,
    subagents,
    title: null,
    classification: { role: 'engineer', department: 'build', confidence: 0, evidence: [] },
    usage: {
      model: null,
      contextTokens: null,
      contextWindow: null,
      contextPct: null,
      compactedAt: null,
      freshTokens: null,
      limit: null,
    },
    process: 'running',
    resources: null,
    liveness: { state: 'active', startedAt: null, quietMs: null, zombies: [] },
    ports: [],
    projectId: null,
    ...over,
  } as AttributedSession;
}

const feedOf = (sessions: AttributedSession[]) =>
  groupFeed(
    buildFeed({
      sessions,
      agents: sessions.map(
        (s) => ({ id: `local:${s.key}`, name: s.key, species: 'fox' }) as unknown as Agent,
      ),
      speech: {},
      seen: {},
      now: NOW,
    }),
    NOW,
  );

describe('squadViewOf', () => {
  it('is null for a session without subagents', () => {
    expect(squadViewOf(session('claude:a', []), NOW)).toBeNull();
  });

  it('counts live and waiting rows and orders waiting, then running by spawn, then finished by end', () => {
    const view = squadViewOf(
      session('claude:a', [
        sub('done-old', { status: 'finished', endedAt: NOW - 40 * SEC }),
        sub('late', { startedAt: NOW - 10 * SEC }),
        sub('done-new', { status: 'finished', endedAt: NOW - 10 * SEC }),
        sub('early', { startedAt: NOW - 50 * SEC }),
        sub('asks', { status: 'waiting_permission', startedAt: NOW - 30 * SEC }),
      ]),
      NOW,
    )!;
    expect(view.rows.map((r) => r.id.split(':sub:')[1])).toEqual([
      'asks',
      'early',
      'late',
      'done-new',
      'done-old',
    ]);
    expect(view).toMatchObject({ live: 3, waiting: 1 });
  });

  it('keeps a finished row for the 90 s grace, fades it after 60 s, then drops it', () => {
    const at = (ago: number) =>
      squadViewOf(session('claude:a', [sub('s', { status: 'finished', endedAt: NOW - ago })]), NOW);
    expect(at(SQUAD_FADE_AFTER_MS - SEC)!.rows[0]!.fading).toBe(false);
    expect(at(SQUAD_FADE_AFTER_MS)!.rows[0]!.fading).toBe(true);
    expect(at(SQUAD_GRACE_MS - SEC)).not.toBeNull();
    expect(at(SQUAD_GRACE_MS)).toBeNull();
  });

  it('uses the last sighting when a finished row has no end time', () => {
    const old = sub('s', { status: 'finished', endedAt: null, lastSeen: NOW - 2 * 60 * SEC });
    expect(squadViewOf(session('claude:a', [old]), NOW)).toBeNull();
  });

  it('folds past three subagents unless one waits for approval', () => {
    const many = (n: number, extra: Partial<Subagent> = {}) =>
      Array.from({ length: n }, (_, i) => sub(`s${i}`, i === 0 ? extra : {}));
    expect(squadViewOf(session('claude:a', many(SQUAD_FOLD_ABOVE)), NOW)!.defaultOpen).toBe(true);
    expect(squadViewOf(session('claude:a', many(SQUAD_FOLD_ABOVE + 1)), NOW)!.defaultOpen).toBe(
      false,
    );
    expect(
      squadViewOf(
        session('claude:a', many(SQUAD_FOLD_ABOVE + 1, { status: 'waiting_permission' })),
        NOW,
      )!.defaultOpen,
    ).toBe(true);
  });

  it('says a tool count only where the source counts tools (a Codex child has none)', () => {
    const view = squadViewOf(
      session('codex:a', [sub('c', { source: 'rollout', tools: null, nickname: 'Hubble' })]),
      NOW,
    )!;
    expect(view.rows[0]).toMatchObject({ toolCount: null, nickname: 'Hubble' });
  });

  it('shows a task label and a result only when the server sent text, as a plain preview of at most 160 chars', () => {
    const plain = squadViewOf(session('claude:a', [sub('s')]), NOW)!.rows[0]!;
    expect(plain).toMatchObject({ task: null, result: null });
    const withText = sub('s', {
      label: '**Find** call sites',
      result: { summary: 'x'.repeat(160), error: null, chars: 400 },
    });
    const row = squadViewOf(session('claude:a', [withText]), NOW)!.rows[0]!;
    expect(row.task).toBe('Find call sites');
    expect(row.result!.length).toBeLessThanOrEqual(160);
  });

  it('keeps a subagent out of the feed as a row of its own and out of the member count', () => {
    const feed = feedOf([session('claude:a', [sub('s1'), sub('s2')])]);
    expect(feedItems(feed)).toHaveLength(1);
    expect(feedItems(feed)[0]!.squad!.rows).toHaveLength(2);
  });
});

describe('groupFeed', () => {
  it('puts a supervisor with a subagent waiting for approval first within its group, else the newest', () => {
    const working = (at: number) => ({
      activity: 'working' as const,
      lastEvent: 'PreToolUse',
      tool: null,
      at,
      recent: [],
    });
    const calm = session('claude:calm', [sub('s')], { mtime: NOW - SEC, hook: working(NOW - SEC) });
    const asking = session('claude:asking', [sub('s', { status: 'waiting_permission' })], {
      mtime: NOW - 10 * 60 * SEC,
      hook: working(NOW - 10 * 60 * SEC),
    });
    const keys = feedItems(feedOf([calm, asking])).map((i) => i.key);
    expect(keys).toEqual(['claude:asking', 'claude:calm']);
  });

  it('leaves sessions without a squad in recency order', () => {
    const feed = feedOf([
      session('claude:old', [], { mtime: NOW - 20 * SEC }),
      session('claude:new', [], { mtime: NOW - 2 * SEC }),
    ]);
    expect(feedItems(feed).map((i) => i.key)).toEqual(['claude:new', 'claude:old']);
  });

  it('stays quick with a 30 subagent squad', () => {
    const big = session(
      'claude:big',
      Array.from({ length: 30 }, (_, i) => sub(`s${i}`)),
    );
    const start = performance.now();
    for (let i = 0; i < 200; i++) squadViewOf(big, NOW);
    expect((performance.now() - start) / 200).toBeLessThan(2);
  });
});

describe('squadHue and squadAccentOf', () => {
  it('is stable per supervisor and inside the palette', () => {
    expect(squadHue('local:claude:a')).toBe(squadHue('local:claude:a'));
    for (const k of ['a', 'b', 'local:codex:z', '']) expect(squadHue(k)).toBeLessThan(SQUAD_HUES);
  });

  it('gives a subagent its supervisor accent and a tether, and a supervisor the accent only while it has live subagents', () => {
    const hue = squadHue('local:claude:a');
    expect(squadAccentOf('local:claude:a:sub:x', {})).toEqual({ squadHue: hue, tether: true });
    expect(squadAccentOf('local:claude:a', { 'local:claude:a': 2 })).toEqual({
      squadHue: hue,
      tether: false,
    });
    expect(squadAccentOf('local:claude:a', { 'local:claude:a': 0 })).toEqual({ tether: false });
  });
});

describe('elapsedLabel', () => {
  it.each([
    [0, '0s'],
    [45 * SEC, '45s'],
    [192 * SEC, '3m12s'],
    [3900 * SEC, '1h05m'],
  ])('%i ms runs for %s', (ms, text) => {
    expect(elapsedLabel({ startedAt: NOW - ms, endedAt: null }, NOW)).toBe(text);
  });

  it('is fixed once ended, and null when the start is unknown', () => {
    expect(elapsedLabel({ startedAt: NOW - 100 * SEC, endedAt: NOW - 40 * SEC }, NOW)).toBe(
      '1m00s',
    );
    expect(elapsedLabel({ startedAt: null, endedAt: null }, NOW)).toBeNull();
  });
});

describe('collapse state', () => {
  it('follows the squad default until the person chooses, then keeps the choice', () => {
    expect(isSquadOpen({}, 'k', { defaultOpen: false })).toBe(false);
    const chosen = withSquadOpen({}, 'k', true);
    expect(isSquadOpen(chosen, 'k', { defaultOpen: false })).toBe(true);
    expect(withSquadOpen(chosen, 'k', true)).toBe(chosen);
  });

  it('round-trips through storage and ignores what is not a map of booleans', () => {
    const state = withSquadOpen(withSquadOpen({}, 'a', true), 'b', false);
    expect(parseSquadOpen(JSON.stringify(state))).toEqual(state);
    for (const raw of [null, '', '[]', '3', '{"a":1,"b":"x"}', '{bad'])
      expect(parseSquadOpen(raw)).toEqual({});
    expect(parseSquadOpen('{"a":true,"b":2}')).toEqual({ a: true });
  });

  it('drops the oldest choices past a bound', () => {
    let state = {};
    for (let i = 0; i < 130; i++) state = withSquadOpen(state, `k${i}`, i % 2 === 0);
    expect(Object.keys(state)).toHaveLength(100);
    expect(state).not.toHaveProperty('k0');
    expect(state).toHaveProperty('k129');
  });
});

describe('announcements', () => {
  const snap = (...rows: [string, boolean][]) => new Map(rows);

  it('counts subagents that started and subagents that finished, not those already there', () => {
    expect(
      squadChange(snap(['a', false], ['b', false]), snap(['a', true], ['b', false], ['c', false])),
    ).toEqual({
      started: 1,
      finished: 1,
    });
  });

  it('is silent when nothing changed, when a finished row leaves, and for a row that arrives finished', () => {
    expect(squadChange(snap(['a', true]), snap())).toEqual({ started: 0, finished: 0 });
    expect(squadChange(snap(), snap(['a', true]))).toEqual({ started: 0, finished: 0 });
    expect(squadChange(snap(['a', false]), snap(['a', false]))).toEqual({
      started: 0,
      finished: 0,
    });
  });

  it('reads the snapshot from a feed', () => {
    const feed = feedOf([
      session('claude:a', [sub('s1'), sub('s2', { status: 'finished', endedAt: NOW - SEC })]),
    ]);
    expect([...snapshotOf(feed).values()].sort()).toEqual([false, true]);
  });
});

describe('words', () => {
  const t = (k: string) =>
    ({
      squadOne: 'subagent',
      squadMany: 'subagents',
      squadWorking: 'working',
      squadAllFinished: 'all finished',
      subWaitingShort: 'waiting for approval',
      subToolOne: 'tool call',
      subToolMany: 'tool calls',
    })[k]!;
  const view = (rows: number, live: number, waiting = 0) =>
    ({ rows: new Array(rows).fill(null), live, waiting }) as never;

  it('summarizes the squad in a header', () => {
    expect(squadSummary(t as never, view(3, 2))).toBe('3 subagents · 2 working');
    expect(squadSummary(t as never, view(1, 0))).toBe('1 subagent · all finished');
    expect(squadSummary(t as never, view(4, 3, 1))).toBe(
      '4 subagents · 3 working · 1 waiting for approval',
    );
  });

  it('counts tool calls, or says nothing when they are not counted', () => {
    expect(toolsText(t as never, { toolCount: 1 })).toBe('1 tool call');
    expect(toolsText(t as never, { toolCount: 14 })).toBe('14 tool calls');
    expect(toolsText(t as never, { toolCount: null })).toBeNull();
  });

  it('fills holes by name', () => {
    expect(fmt('{n} of {name}', { n: 2, name: 'main' })).toBe('2 of main');
  });

  it("finds a subagent's own calls by the id the hook recorded", () => {
    const s = session('claude:a', [sub('s1')], {
      hook: {
        activity: 'working',
        lastEvent: 'PreToolUse',
        tool: 'Read',
        at: NOW,
        recent: [
          { tool: 'Read', target: 'a.ts', at: NOW - 3 * SEC, agentId: 's1', tags: [], ok: null },
          { tool: 'Edit', target: 'b.ts', at: NOW - 2 * SEC, agentId: null, tags: [], ok: null },
        ],
      },
    });
    expect(callsOf(s, 'local:claude:a:sub:s1').map((c) => c.tool)).toEqual(['Read']);
  });
});

describe('treeNav', () => {
  const levels = [1, 2, 2, 2];

  it('moves between visible items and stops at the ends', () => {
    expect(treeNav('ArrowDown', 0, levels, true)).toEqual({ focus: 1 });
    expect(treeNav('ArrowDown', 3, levels, null)).toBeNull();
    expect(treeNav('ArrowUp', 0, levels, true)).toBeNull();
    expect(treeNav('ArrowUp', 2, levels, null)).toEqual({ focus: 1 });
    expect(treeNav('Home', 2, levels, null)).toEqual({ focus: 0 });
    expect(treeNav('End', 0, levels, true)).toEqual({ focus: 3 });
  });

  it('opens with Right, enters an open parent, folds with Left, and Left on a child goes to its parent', () => {
    expect(treeNav('ArrowRight', 0, [1], false)).toEqual({ open: true });
    expect(treeNav('ArrowRight', 0, levels, true)).toEqual({ focus: 1 });
    expect(treeNav('ArrowRight', 2, levels, null)).toBeNull();
    expect(treeNav('ArrowLeft', 0, levels, true)).toEqual({ open: false });
    expect(treeNav('ArrowLeft', 2, levels, null)).toEqual({ focus: 0 });
    expect(treeNav('ArrowLeft', 0, [1], false)).toBeNull();
    expect(treeNav('x', 0, levels, true)).toBeNull();
  });
});
