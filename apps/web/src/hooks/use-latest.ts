import { useRef, type RefObject } from 'react';

/**
 * A ref that always holds the latest render's value, so an effect that must run only for its own trigger can read what
 * else it needs without listing it: a new callback never re-runs it.
 */
export function useLatest<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
