type Cell = { value?: unknown; deps?: readonly unknown[]; cleanup?: (() => void) | void };

type Instance = { cells: Cell[]; pass: () => void };
let active: Instance = { cells: [], pass: () => undefined };
let cursor = 0;
let queue: (() => void)[] = [];

const same = (a: readonly unknown[] | undefined, b: readonly unknown[] | undefined) =>
  !!a && !!b && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
const cell = () => (active.cells[cursor] ??= {});

export function useState<T>(initial: T | (() => T)) {
  const c = cell();
  const index = cursor++;
  const owner = active;
  if (!('value' in c)) c.value = typeof initial === 'function' ? (initial as () => T)() : initial;
  const set = (next: T | ((prev: T) => T)) => {
    const slot = owner.cells[index]!;
    const value = typeof next === 'function' ? (next as (p: T) => T)(slot.value as T) : next;
    if (Object.is(value, slot.value)) return;
    slot.value = value;
    owner.pass();
  };
  return [c.value as T, set] as const;
}
export function useReducer<S, A>(reducer: (state: S, action: A) => S, initial: S) {
  const [state, setState] = useState(initial);
  return [state, (action: A) => setState((previous) => reducer(previous, action))] as const;
}
export function useRef<T>(initial: T) {
  const c = cell();
  cursor++;
  if (!('value' in c)) c.value = { current: initial };
  return c.value as { current: T };
}
export function useMemo<T>(make: () => T, deps: readonly unknown[]): T {
  const c = cell();
  cursor++;
  if (!('value' in c) || !same(c.deps, deps)) {
    c.value = make();
    c.deps = deps;
  }
  return c.value as T;
}
export const useCallback = <T>(fn: T, deps: readonly unknown[]): T => useMemo(() => fn, deps);
export function useEffect(run: () => (() => void) | void, deps?: readonly unknown[]) {
  const c = cell();
  cursor++;
  if (deps && same(c.deps, deps)) return;
  c.deps = deps;
  const previous = c.cleanup;
  queue.push(() => {
    if (typeof previous === 'function') previous();
    c.cleanup = run();
  });
}
export const useLayoutEffect = useEffect;
export function useSyncExternalStore<T>(
  subscribe: (notify: () => void) => () => void,
  snapshot: () => T,
): T {
  const c = cell();
  cursor++;
  const owner = active;
  if (!c.cleanup) c.cleanup = subscribe(() => owner.pass());
  return snapshot();
}
export const createContext = <T>(value: T) => ({ _value: value });
export const useContext = <T>(context: { _value: T }) => context._value;

export type Rendered<A extends unknown[], R> = {
  readonly current: R;
  rerender: (...next: A | []) => void;
  unmount: () => void;
};

export function renderHook<A extends unknown[], R>(
  hook: (...args: A) => R,
  ...args: A
): Rendered<A, R> {
  const me: Instance = { cells: [], pass: () => undefined };
  let latest!: R;
  let current = args;
  const pass = () => {
    active = me;
    cursor = 0;
    queue = [];
    latest = hook(...current);
    const effects = queue;
    queue = [];
    for (const effect of effects) effect();
  };
  me.pass = pass;
  pass();
  return {
    get current() {
      return latest;
    },
    rerender: (...next) => {
      if (next.length) current = next as A;
      pass();
    },
    unmount: () => {
      for (const slot of me.cells) if (typeof slot.cleanup === 'function') slot.cleanup();
    },
  };
}
export default {
  useState,
  useReducer,
  useRef,
  useMemo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useSyncExternalStore,
};
