/** The lines waiting to be announced, and when the last one was. */
type LogQueue = { queue: readonly string[]; lastAt: number };
export const emptyLogQueue: LogQueue = { queue: [], lastAt: Number.NEGATIVE_INFINITY };

/** At most one line a screen reader hears per this long; the rest wait their turn. */
export const LOG_GAP_MS = 5_000;
/** How many lines the region keeps. */
const LOG_KEEP = 5;

export const announce = (log: LogQueue, text: string): LogQueue => ({
  ...log,
  queue: [...log.queue, text],
});

/** The next line to announce now (null when none is due), with the queue after it. */
export function drain(log: LogQueue, now: number): { log: LogQueue; line: string | null } {
  const [line, ...queue] = log.queue;
  if (line === undefined || now - log.lastAt < LOG_GAP_MS) return { log, line: null };
  return { log: { queue, lastAt: now }, line };
}

/** How long until the next queued line may be announced; null when nothing waits. */
export const nextDrainIn = (log: LogQueue, now: number): number | null =>
  log.queue.length ? Math.max(0, LOG_GAP_MS - (now - log.lastAt)) : null;

/**
 * The visually hidden `role="log"` region that tells a screen reader what the office is doing, one polite line at a time.
 * Plain DOM so the scene can mount it next to its canvas with one hook; `push` queues a line, `dispose` removes it.
 */
export function mountLog(host: HTMLElement, label: string) {
  const region = document.createElement('div');
  region.className = 'visually-hidden';
  region.setAttribute('role', 'log');
  region.setAttribute('aria-live', 'polite');
  region.setAttribute('aria-label', label);
  host.appendChild(region);
  let log = emptyLogQueue;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pump = () => {
    const now = Date.now();
    const next = drain(log, now);
    log = next.log;
    if (next.line !== null) {
      const row = document.createElement('p');
      row.textContent = next.line;
      region.append(row);
      while (region.childElementCount > LOG_KEEP) region.firstElementChild?.remove();
    }
    const wait = nextDrainIn(log, now);
    if (wait !== null) timer = setTimeout(pump, wait);
  };
  return {
    push(text: string) {
      log = announce(log, text);
      clearTimeout(timer);
      pump();
    },
    dispose() {
      clearTimeout(timer);
      region.remove();
    },
  };
}
