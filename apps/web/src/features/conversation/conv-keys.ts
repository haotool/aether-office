export type KeyAction = 'next' | 'prev' | 'top' | 'bottom';
export type KeyState = { pending: 'g' | null; at: number };

const CHORD_MS = 800;

export function nextKey(
  state: KeyState,
  key: string,
  now: number,
): { action: KeyAction | null; state: KeyState } {
  const idle: KeyState = { pending: null, at: 0 };
  if (key === 'j') return { action: 'next', state: idle };
  if (key === 'k') return { action: 'prev', state: idle };
  if (key === 'G') return { action: 'bottom', state: idle };
  if (key === 'g') {
    return state.pending === 'g' && now - state.at <= CHORD_MS
      ? { action: 'top', state: idle }
      : { action: null, state: { pending: 'g', at: now } };
  }
  return { action: null, state };
}
