// A synthetic `@tanstack/react-query` for hook tests without a React renderer: `useQuery` records the options it was given
// (so a test can read the polling rule, the `enabled` flag and run the `queryFn`) and answers from a cache the test fills.
// There is no fetching, no staleness and no retry: that is the library's own behaviour, not the app's.
export type QueryOptions = {
  queryKey: readonly unknown[];
  queryFn?: () => unknown;
  enabled?: boolean;
  refetchInterval?:
    number | false | ((query: { state: { data: unknown; error: unknown } }) => unknown);
  [other: string]: unknown;
};

const keyOf = (key: readonly unknown[]) => JSON.stringify(key);
export const store = {
  calls: [] as QueryOptions[],
  data: new Map<string, unknown>(),
  errors: new Map<string, unknown>(),
  invalidated: [] as (readonly unknown[])[],
};

export function resetQueries() {
  store.calls = [];
  store.data.clear();
  store.errors.clear();
  store.invalidated = [];
}
/** Puts an answer in the cache, as a finished fetch would. */
export const seed = (key: readonly unknown[], data: unknown) =>
  void store.data.set(keyOf(key), data);
/** The options of the latest `useQuery` call for this key. */
export const optionsFor = (key: readonly unknown[]): QueryOptions => {
  const found = [...store.calls].reverse().find((c) => keyOf(c.queryKey) === keyOf(key));
  if (!found) throw new Error(`no useQuery for ${keyOf(key)}`);
  return found;
};

export function useQuery(options: QueryOptions) {
  store.calls.push(options);
  const key = keyOf(options.queryKey);
  const data = store.data.get(key);
  return {
    data,
    error: store.errors.get(key) ?? null,
    isLoading: data === undefined && options.enabled !== false,
    dataUpdatedAt: 0,
  };
}

const client = {
  invalidateQueries: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    store.invalidated.push(queryKey);
    return Promise.resolve();
  },
  setQueryData: (key: readonly unknown[], data: unknown) => seed(key, data),
};
export const useQueryClient = () => client;
