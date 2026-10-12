/**
 * The one place a polling interval is written down, so how often the app asks (battery and load on a phone) is changed
 * here. Where the server pushes, asking is only the net under the push.
 */
export const POLL = {
  screen: 250,
  watching: 2000,
  prompt: 2500,
  driving: 3000,
  working: 4000,
  list: 5000,
  quiet: 6000,
  idle: 10_000,
  system: 20_000,
  slow: 30_000,
  /** The subscription windows, the commit counts once a repository is known: once a minute is plenty. */
  rare: 60_000,
} as const;

/** The polling interval to use: the slow net while the stream is live (CPU and memory are not events), otherwise the caller's own. */
export function pollMs<T>(live: boolean, fallback: T): T | number {
  return live ? POLL.slow : fallback;
}

export const poll = (ms: number | false) => ({ refetchInterval: ms });

export const pollBy = <T>(next: (data: T | undefined, failed: boolean) => number | false) => ({
  refetchInterval: (query: { state: { data: T | undefined; error: Error | null } }) =>
    next(query.state.data, query.state.error !== null),
});
