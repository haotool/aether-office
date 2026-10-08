// Guided camera tour: a pure state machine so skip, pause, interrupt and restore are testable.
export const TOUR_STOPS = [
  'engineering',
  'review',
  'collaboration',
  'compute',
  'knowledge',
  'arrival',
  'lounge',
  'integrations',
] as const;
export const TOUR_INTERVAL_MS = 4000;

export type TourState =
  { status: 'idle' } | { status: 'playing' | 'paused'; index: number; restore: string };
export type TourAction =
  | { type: 'start'; restore: string }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'skip' } // advance to the next stop immediately
  | { type: 'interrupt' } // the user touched the camera: stop without moving it
  | { type: 'stop' };

export const idle: TourState = { status: 'idle' };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case 'start':
      return { status: 'playing', index: 0, restore: action.restore };
    case 'pause':
      return state.status === 'playing' ? { ...state, status: 'paused' } : state;
    case 'resume':
      return state.status === 'paused' ? { ...state, status: 'playing' } : state;
    case 'skip':
      if (state.status === 'idle') return state;
      return state.index + 1 >= TOUR_STOPS.length ? idle : { ...state, index: state.index + 1 };
    case 'interrupt':
    case 'stop':
      return idle;
  }
}

/** Focus the tour wants, or null when it should not move the camera. */
export const tourFocus = (state: TourState): string | null =>
  state.status === 'idle' ? null : TOUR_STOPS[state.index]!;

/** Where the camera returns when the tour ends on its own or is stopped explicitly. */
export const restoreFocus = (
  before: TourState,
  action: TourAction,
  after: TourState,
): string | null =>
  before.status !== 'idle' && after.status === 'idle' && action.type !== 'interrupt'
    ? before.restore
    : null;
