// Plain numbers the web page also needs. They live apart from sessions.ts so that importing one does not pull that file's
// schemas (and so the whole of zod) into the page's first load.

// How long after its last sign of life a session still counts as at work, and how long a session with no process
// behind it is kept before it is gone. Server (liveness, child rollouts) and client (activityOf) share these.
export const SESSION_ACTIVE_MS = 2 * 60 * 1000;
export const SESSION_GONE_MS = 10 * 60 * 1000;

/** "Clock out" sends at most this many idle sessions home in one request. */
export const CLOCK_OUT_MAX_SESSIONS = 50;
