import type { LocalSession } from '@aether/contracts';
import type { Speech } from './session-speech.js';

/**
 * What changed in the local sessions, derived from the scan the server already runs: no per-client polling. An event
 * names a session and what kind of thing changed, never the content; the browser then asks the usual endpoints, which
 * are the only place the (redacted) content is returned.
 */
export type ChangeKind = 'state' | 'tool' | 'speech' | 'transcript';
export type SessionChange = { seq: number; key: string; kinds: ChangeKind[] };
type Print = Record<ChangeKind, string>;
export type Prints = ReadonlyMap<string, Print>;

const printOf = (s: LocalSession, speech: Speech | undefined): Print => ({
  state: [s.process, s.liveness.state, s.hook?.activity, s.hook?.lastEvent].join('|'),
  tool: s.hook?.tool ?? '',
  speech: [speech?.user?.text, speech?.assistant?.text].join('\u0000'),
  transcript: String(s.mtime),
});

/** Pure. The prints of this scan and the sessions that differ from `prev` (none at all when there is no baseline yet). */
export function diffSessions(
  prev: Prints | null,
  sessions: readonly LocalSession[],
  speech: Readonly<Record<string, Speech>>,
): { next: Prints; changed: { key: string; kinds: ChangeKind[] }[] } {
  const next = new Map(sessions.map((s) => [s.key, printOf(s, speech[s.key])]));
  if (!prev) return { next, changed: [] };
  const changed = [...new Set([...prev.keys(), ...next.keys()])].flatMap((key) => {
    const before = prev.get(key);
    const after = next.get(key);
    const kinds: ChangeKind[] =
      before && after
        ? (Object.keys(after) as ChangeKind[]).filter((k) => before[k] !== after[k])
        : ['state']; // appeared or vanished
    return kinds.length ? [{ key, kinds }] : [];
  });
  return { next, changed };
}

export type Subscription = {
  /** The newest sequence number, and whether the caller missed changes the hub no longer remembers. */
  seq: number;
  resync: boolean;
  replay: SessionChange[];
  unsubscribe: () => void;
};

const REMEMBERED = 256;

/**
 * One watcher shared by every client: it scans every `intervalMs` while anyone is subscribed and stops when nobody is.
 * Each tick yields at most one change per session (kinds merged), so a session never produces more than 1000/intervalMs
 * events a second however fast its transcript grows. Sequence numbers start at the clock so they keep rising across a
 * restart; a client that fell behind the remembered window is told to refetch instead.
 */
export function createSessionHub(options: {
  intervalMs: number;
  scan: () => Promise<{ sessions: LocalSession[]; speech: Record<string, Speech> }>;
}) {
  const listeners = new Set<(change: SessionChange) => void>();
  let ring: SessionChange[] = [];
  let seq = Date.now();
  let forgotten = seq; // the newest sequence number the hub cannot replay: all before it started, then what fell out of `ring`
  let prints: Prints | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      const { sessions, speech } = await options.scan();
      const { next, changed } = diffSessions(prints, sessions, speech);
      prints = next;
      for (const { key, kinds } of changed) {
        const change = { seq: ++seq, key, kinds };
        ring.push(change);
        for (const listener of listeners) listener(change);
      }
      if (ring.length > REMEMBERED) {
        forgotten = ring[ring.length - REMEMBERED - 1]!.seq;
        ring = ring.slice(-REMEMBERED);
      }
    } catch {
      /* a failed scan changes nothing; the next tick tries again */
    } finally {
      busy = false;
    }
  }

  return {
    subscribe(after: number | null, listener: (change: SessionChange) => void): Subscription {
      listeners.add(listener);
      if (!timer) {
        void tick(); // the baseline, so the first real change is seen
        timer = setInterval(() => void tick(), options.intervalMs);
        timer.unref();
      }
      const resync = after !== null && (after < forgotten || after > seq);
      return {
        seq,
        resync,
        replay: after === null || resync ? [] : ring.filter((c) => c.seq > after),
        unsubscribe() {
          listeners.delete(listener);
          if (!listeners.size && timer) {
            clearInterval(timer);
            timer = undefined;
            prints = null;
            forgotten = seq; // changes while nobody watched are not replayed: a returning client resyncs
          }
        },
      };
    },
    tick,
    get clients() {
      return listeners.size;
    },
  };
}
