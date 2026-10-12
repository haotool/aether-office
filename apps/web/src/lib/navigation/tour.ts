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
  | { type: 'skip' }
  | { type: 'interrupt' }
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

export const tourFocus = (state: TourState): string | null => {
  if (state.status === 'idle') return null;
  const stop = TOUR_STOPS[state.index];
  if (stop === undefined) throw new Error('tour stop index out of range');
  return stop;
};

export const restoreFocus = (
  before: TourState,
  action: TourAction,
  after: TourState,
): string | null =>
  before.status !== 'idle' && after.status === 'idle' && action.type !== 'interrupt'
    ? before.restore
    : null;
