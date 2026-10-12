import { introSegments, introSegmentAt, type IntroPhase } from './intro-tour.js';

export type IntroOutcome = 'completed' | 'interrupted' | 'aborted';

export type IntroState =
  | { status: 'idle' }
  | { status: 'preparing'; reduced: boolean }
  | { status: 'playing'; reduced: boolean; startedAt: number; phase: IntroPhase }
  | { status: 'done'; outcome: IntroOutcome };

export type IntroAction =
  | { type: 'start'; reduced: boolean }
  | { type: 'ready'; now: number }
  | { type: 'tick'; now: number }
  | { type: 'interrupt' }
  | { type: 'skip'; now: number }
  | { type: 'abort' };

export const introIdle: IntroState = { status: 'idle' };

export const introActive = (state: IntroState) =>
  state.status === 'preparing' || state.status === 'playing';

export const introElapsed = (state: IntroState, now: number) =>
  state.status === 'playing' ? Math.max(0, (now - state.startedAt) / 1000) : 0;

const settle = (outcome: IntroOutcome): IntroState => ({ status: 'done', outcome });

const introOnStart = (state: IntroState, reduced: boolean): IntroState =>
  state.status === 'idle' || state.status === 'done' ? { status: 'preparing', reduced } : state;

const introOnReady = (state: IntroState, now: number): IntroState =>
  state.status === 'preparing'
    ? { status: 'playing', reduced: state.reduced, startedAt: now, phase: 'orbit' }
    : state;

const introOnTick = (state: IntroState, now: number): IntroState => {
  if (state.status !== 'playing') return state;
  const t = (now - state.startedAt) / 1000;
  const segment = introSegmentAt(t, state.reduced);
  if (!segment) return settle('completed');
  return segment.phase === state.phase ? state : { ...state, phase: segment.phase };
};

const introOnSkip = (state: IntroState, now: number): IntroState => {
  if (!introActive(state)) return state;
  const last = introSegments(state.reduced).at(-1);
  if (!last) return state;
  if (state.status === 'playing' && state.phase === last.phase) return state;
  return {
    status: 'playing',
    reduced: state.reduced,
    startedAt: now - last.from * 1000,
    phase: last.phase,
  };
};

/**
 * Pure: time comes in with each action, so a replay of the same actions gives the same states. A tick that changes
 * nothing returns the same object, so React does not redraw for it.
 */
export function introReducer(state: IntroState, action: IntroAction): IntroState {
  switch (action.type) {
    case 'start':
      return introOnStart(state, action.reduced);
    case 'ready':
      return introOnReady(state, action.now);
    case 'tick':
      return introOnTick(state, action.now);
    case 'skip':
      return introOnSkip(state, action.now);
    case 'interrupt':
      return introActive(state) ? settle('interrupted') : state;
    case 'abort':
      return introActive(state) ? settle('aborted') : state;
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
