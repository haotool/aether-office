// Plain numbers the web page also needs. They live apart from sessions.ts so that importing one does not pull that file's
// schemas (and so the whole of zod) into the page's first load.

export const SESSION_ACTIVE_MS = 2 * 60 * 1000;
export const SESSION_GONE_MS = 10 * 60 * 1000;

export const CLOCK_OUT_MAX_SESSIONS = 50;
