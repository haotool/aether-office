/**
 * How long a page waits before it asks again, and why: the one place an interval is written down, so how often the app
 * asks (battery and load on a phone) is changed here. Where the server pushes, asking is only the net under the push.
 * Kept in order of urgency.
 */
export const POLL = {
  /** A terminal's screen while it runs: it changes with every keystroke. */
  screen: 250,
  /** What is on screen right now and moving: reviews running, observations, workspaces, a terminal list, a message's waits. */
  watching: 2000,
  /** A Claude Code permission prompt: the hook that asked gives up after about a minute. */
  prompt: 2500,
  /** Something a person is driving right now: a session's terminal, an integration being run. */
  driving: 3000,
  /** Work in progress: sessions at work, review comments being written, a first scan of a long history. */
  working: 4000,
  /** A page's own list while the page is open. */
  list: 5000,
  /** A transcript or speech that nothing is writing to, with no push to tell. */
  quiet: 6000,
  /** Nothing is working: whether a terminal exists, which sessions there are. */
  idle: 10_000,
  /** The machine's CPU, memory and disk: shown, never acted on. */
  system: 20_000,
  /** Slow-changing things, and the net under a push: the stream says what changed, this catches what it missed. */
  slow: 30_000,
  /** The subscription windows, the commit counts once a repository is known: once a minute is plenty. */
  rare: 60_000,
} as const;

/** The polling interval to use: the slow net while the stream is live (CPU and memory are not events), otherwise the caller's own. */
export function pollMs<T>(live: boolean, fallback: T): T | number {
  return live ? POLL.slow : fallback;
}

/** Ask again every `ms`, or never (`false`). Spread into a query's options. */
export const poll = (ms: number | false) => ({ refetchInterval: ms });

/** Ask again when what was answered so far says how soon: `next` gets the data (none before the first answer) and whether the last try failed. */
export const pollBy = <T>(next: (data: T | undefined, failed: boolean) => number | false) => ({
  refetchInterval: (query: { state: { data: T | undefined; error: Error | null } }) =>
    next(query.state.data, query.state.error !== null),
});
