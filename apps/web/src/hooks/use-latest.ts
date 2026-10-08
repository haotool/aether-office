import { useRef, type RefObject } from 'react';

/**
 * A ref that always holds the value of the latest render. An effect that must run only for its own trigger (a key, a
 * selection, arrival) reads what else it needs from here instead of listing it, so a new callback never re-runs it.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
