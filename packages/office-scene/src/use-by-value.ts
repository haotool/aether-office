import { useRef } from 'react';

/** `prev` while `next` holds the same numbers, else `next`: what makes a fresh-every-render tuple a stable dependency. */
export function keepIfEqual<T extends readonly number[]>(prev: T, next: T): T {
  return prev.length === next.length && prev.every((n, i) => n === next[i]) ? prev : next;
}

/** The same tuple object for as long as its numbers do not change, so it can sit in a hook's dependency list. */
export function useByValue<T extends readonly number[]>(value: T): T {
  const held = useRef(value);
  held.current = keepIfEqual(held.current, value);
  return held.current;
}
