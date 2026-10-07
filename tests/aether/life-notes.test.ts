import { describe, expect, it } from 'vitest';
import { EFFECTS } from '../../packages/office-scene/src/life/effects/index.js';
import { ruleOf } from '../../packages/office-scene/src/life/registry.js';
import type { LifeSignal } from '../../packages/office-scene/src/life/signals.js';
import { office } from './life-fixtures.js';

const start = (tags: LifeSignal['tags'], tool = 'Bash'): LifeSignal => ({
  kind: 'tool.start',
  member: 'm1',
  at: 0,
  tool,
  ...(tags ? { tags } : {}),
});
const fires = (id: string, signal: LifeSignal) => ruleOf(id)!.when(signal, office());

describe('R21 time machine', () => {
  it('starts from a hard reset the hook labelled, and from nothing else', () => {
    expect(fires('time-machine', start(['git.reset.hard']))).toBe(true);
    expect(fires('time-machine', start(['git.push']))).toBe(false);
    expect(fires('time-machine', start(undefined))).toBe(false);
    expect(
      fires('time-machine', { ...start(['git.reset.hard']), kind: 'tool.end', ok: true }),
    ).toBe(false); // it says "started", never how the reset ended
  });

  it('shows on the high tier only, and says what was started', () => {
    expect(ruleOf('time-machine')!.minTier).toBe('high');
    expect(ruleOf('time-machine')!.aria('Ada', false, start(['git.reset.hard']))).toMatch(
      /started a hard reset/,
    );
  });

  it('turns one swirl, tinted calm blue, with no danger colour', () => {
    const [swirl] = EFFECTS['time-machine'](1000, 2000, 1, 0);
    expect(swirl?.cell).toBe('swirl');
    const [r, g, b] = swirl!.tint!;
    expect(b).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(g * 0.9);
  });
});

describe('R43 TODO notes', () => {
  it('starts from a search the hook labelled search.todo, and from nothing else', () => {
    expect(fires('todo-notes', start(['search.todo'], 'Grep'))).toBe(true);
    expect(fires('todo-notes', start(['search.todo'], 'Bash'))).toBe(true);
    expect(fires('todo-notes', start(['test']))).toBe(false);
    expect(fires('todo-notes', start(undefined, 'Grep'))).toBe(false);
  });

  it('pops at most three notes, one after another, and none before the effect starts', () => {
    expect(EFFECTS['todo-notes'](-1, 3000, 1, 0)).toEqual([]);
    expect(EFFECTS['todo-notes'](100, 3000, 1, 0)).toHaveLength(1);
    expect(EFFECTS['todo-notes'](1000, 3000, 1, 0)).toHaveLength(3);
    expect(EFFECTS['todo-notes'](2000, 3000, 7, 0).every((s) => s.cell === 'sticky')).toBe(true);
  });
});
