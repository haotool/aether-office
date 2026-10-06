import { describe, expect, it } from 'vitest';
import {
  introActive,
  introElapsed,
  introIdle,
  introReducer,
  type IntroAction,
  type IntroState,
} from '../../packages/office-scene/src/intro/intro-machine.js';

const run = (actions: readonly IntroAction[], from: IntroState = introIdle) =>
  actions.reduce(introReducer, from);
const playingAt = (now: number, reduced = false) =>
  run([
    { type: 'start', reduced },
    { type: 'ready', now },
  ]);

describe('introReducer', () => {
  it('goes idle, preparing, playing and walks the phases by the clock', () => {
    let s = run([{ type: 'start', reduced: false }]);
    expect(s).toEqual({ status: 'preparing', reduced: false });
    s = introReducer(s, { type: 'ready', now: 1000 });
    expect(s).toMatchObject({ status: 'playing', startedAt: 1000, phase: 'orbit' });
    for (const [seconds, phase] of [
      [10, 'orbit'],
      [26.1, 'toExploded'],
      [30, 'rise'],
      [42, 'hold'],
      [45.5, 'toStacked'],
    ] as const) {
      s = introReducer(s, { type: 'tick', now: 1000 + seconds * 1000 });
      expect(s).toMatchObject({ status: 'playing', phase });
    }
    expect(introReducer(s, { type: 'tick', now: 1000 + 45.9 * 1000 })).toEqual({
      status: 'done',
      outcome: 'completed',
    });
  });

  it('a tick that changes nothing returns the same state, so nothing redraws', () => {
    const s = playingAt(0);
    expect(introReducer(s, { type: 'tick', now: 5000 })).toBe(s);
  });

  it('runs the reduced tour on its own, shorter clock', () => {
    const s = playingAt(0, true);
    expect(introReducer(s, { type: 'tick', now: 4000 })).toMatchObject({ phase: 'rise' });
    expect(introReducer(s, { type: 'tick', now: 11000 })).toMatchObject({ outcome: 'completed' });
  });

  it('any input interrupts, while preparing or playing, and ends the tour where the camera is', () => {
    expect(run([{ type: 'start', reduced: false }, { type: 'interrupt' }])).toEqual({
      status: 'done',
      outcome: 'interrupted',
    });
    const s = introReducer(playingAt(0), { type: 'interrupt' });
    expect(s).toEqual({ status: 'done', outcome: 'interrupted' });
    expect(introActive(s)).toBe(false);
  });

  it('Esc winds the clock to the closing cut, from the orbit or from preparing', () => {
    const s = introReducer(playingAt(0), { type: 'skip', now: 7000 });
    expect(s).toMatchObject({ status: 'playing', phase: 'toStacked' });
    expect(introElapsed(s, 7000)).toBeCloseTo(45.4, 6);
    expect(introReducer(s, { type: 'tick', now: 7000 + 300 })).toBe(s); // still under the closing dip
    expect(introReducer(s, { type: 'tick', now: 7000 + 500 })).toEqual({
      status: 'done',
      outcome: 'completed',
    });
    expect(
      run([
        { type: 'start', reduced: false },
        { type: 'skip', now: 0 },
      ]),
    ).toMatchObject({
      status: 'playing',
      phase: 'toStacked',
    });
  });

  it('a second Esc during the closing cut changes nothing', () => {
    const s = introReducer(playingAt(0), { type: 'skip', now: 100 });
    expect(introReducer(s, { type: 'skip', now: 300 })).toBe(s);
  });

  it('aborts when the page is hidden, and ignores every action once it is over', () => {
    const done = run([{ type: 'start', reduced: false }, { type: 'abort' }]);
    expect(done).toEqual({ status: 'done', outcome: 'aborted' });
    for (const action of [
      { type: 'ready', now: 1 },
      { type: 'tick', now: 2 },
      { type: 'interrupt' },
      { type: 'skip', now: 3 },
      { type: 'abort' },
    ] as const)
      expect(introReducer(done, action)).toBe(done);
  });

  it('can be started again (replay) once done, but not while it plays', () => {
    const done = run([{ type: 'start', reduced: false }, { type: 'interrupt' }]);
    expect(introReducer(done, { type: 'start', reduced: true })).toEqual({
      status: 'preparing',
      reduced: true,
    });
    const s = playingAt(0);
    expect(introReducer(s, { type: 'start', reduced: false })).toBe(s);
  });
});
