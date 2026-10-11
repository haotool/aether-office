import type { LocalSession } from '@aether/contracts';
import type { Speech } from './session-speech.js';

/**
 * What changed in the local sessions, derived from the scan the server already runs: no per-client polling. An event
 * names a session and what kind of thing changed (state, tool, speech, transcript, squad, outcome), never the content; the browser then asks the usual endpoints, which
 * are the only place the (redacted) content is returned.
 */
type ChangeKind = 'state' | 'tool' | 'speech' | 'transcript' | 'squad' | 'outcome';
export type SessionChange = { seq: number; key: string; kinds: ChangeKind[] };
type Print = Record<ChangeKind, string>;
type Prints = ReadonlyMap<string, Print>;

const printOf = (s: LocalSession, speech: Speech | undefined): Print => ({
  state: [s.process, s.liveness.state, s.hook?.activity, s.hook?.lastEvent].join('|'),
  tool: s.hook?.tool ?? '',
  speech: [speech?.user?.text, speech?.assistant?.text].join('\u0000'),
  transcript: String(s.mtime),
  // A helper came, went, changed status or made a tool call, or returned: ids, statuses and counts, never their words.
  squad: s.subagents
    .map((c) => [c.id, c.status, c.tools?.count ?? '', c.result ? 'r' : ''].join(':'))
    .join('|'),
  // A tool call started or ended (its time and outcome), or the conflict count moved: numbers and flags only.
  outcome: [...(s.hook?.recent.map((c) => `${c.at}:${c.ok}`) ?? []), s.git?.conflicts ?? ''].join(
    '|',
  ),
});

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
        : after
          ? ['state', 'speech', 'transcript']
          : ['state'];
    return kinds.length ? [{ key, kinds }] : [];
  });
  return { next, changed };
}

type Subscription = {
  seq: number;
  resync: boolean;
  /** Settles once the baseline scan is in: only then is whatever a client reads next at least as new as the baseline. */
  ready: Promise<void>;
  replay: SessionChange[];
  unsubscribe: () => void;
};

const REMEMBERED = 256;

/**
 * One watcher shared by every client, scanning only while someone subscribes. One change per session per tick, so a
 * session never yields more than 1000/intervalMs events a second. Sequence numbers start at the clock to keep rising
 * across restarts.
 */
class SessionHub {
  private readonly listeners = new Set<(change: SessionChange) => void>();
  private ring: SessionChange[] = [];
  private seq = Date.now();
  private forgotten = this.seq; // the newest sequence number the hub cannot replay: all before it started, then what fell out of `ring`
  private prints: Prints | null = null;
  private timer: ReturnType<typeof setInterval> | undefined;
  private busy = false;
  private baseline: Promise<void> = Promise.resolve();

  constructor(
    private readonly options: {
      intervalMs: number;
      scan: () => Promise<{ sessions: LocalSession[]; speech: Record<string, Speech> }>;
    },
  ) {}

  private publish(change: SessionChange) {
    this.ring.push(change);
    for (const listener of this.listeners) listener(change);
    if (this.ring.length > REMEMBERED) {
      this.forgotten = this.ring[this.ring.length - REMEMBERED - 1]?.seq ?? this.forgotten;
      this.ring = this.ring.slice(-REMEMBERED);
    }
  }

  readonly tick = async () => {
    if (this.busy) return;
    this.busy = true;
    try {
      const { sessions, speech } = await this.options.scan();
      const { next, changed } = diffSessions(this.prints, sessions, speech);
      this.prints = next;
      for (const { key, kinds } of changed) this.publish({ seq: ++this.seq, key, kinds });
    } catch {
      /* a failed scan changes nothing; the next tick tries again */
    } finally {
      this.busy = false;
    }
  };

  private stopWatching() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.prints = null;
    this.forgotten = this.seq; // changes while nobody watched are not replayed: a returning client resyncs
  }

  subscribe(after: number | null, listener: (change: SessionChange) => void): Subscription {
    this.listeners.add(listener);
    if (!this.timer) {
      this.baseline = this.tick();
      this.timer = setInterval(() => void this.tick(), this.options.intervalMs);
      this.timer.unref();
    }
    const resync = after !== null && (after < this.forgotten || after > this.seq);
    return {
      seq: this.seq,
      resync,
      ready: this.baseline,
      replay: after === null || resync ? [] : this.ring.filter((c) => c.seq > after),
      unsubscribe: () => {
        this.listeners.delete(listener);
        if (!this.listeners.size && this.timer) this.stopWatching();
      },
    };
  }

  get clients() {
    return this.listeners.size;
  }
}

export const createSessionHub = (options: ConstructorParameters<typeof SessionHub>[0]) =>
  new SessionHub(options);
