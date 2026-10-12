// A synthetic `zustand` for tests without a React renderer: the same `create` contract, with the hook reading the
// current state instead of subscribing through React.
type Set<T> = (next: Partial<T> | ((state: T) => Partial<T>)) => void;
type Init<T> = (set: Set<T>, get: () => T) => T;

function build<T>(init: Init<T>) {
  let state!: T;
  const listeners = new globalThis.Set<() => void>();
  const set: Set<T> = (next) => {
    state = { ...state, ...(typeof next === 'function' ? next(state) : next) };
    listeners.forEach((l) => l());
  };
  state = init(set, () => state);
  const hook = <S>(select: (state: T) => S = (s) => s as unknown as S) => select(state);
  return Object.assign(hook, {
    getState: () => state,
    setState: set,
    subscribe: (l: () => void) => (listeners.add(l), () => listeners.delete(l)),
  });
}

export function create<T>(init: Init<T>): ReturnType<typeof build<T>>;
export function create<T>(): (init: Init<T>) => ReturnType<typeof build<T>>;
export function create<T>(init?: Init<T>) {
  return init ? build(init) : (next: Init<T>) => build(next);
}
