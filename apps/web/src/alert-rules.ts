/** Pure rules for the alerts about local sessions: what is worth a notification, what it says, and where it is shown. */
export type SessionEvent = {
  key: string;
  kind: 'needs-you' | 'finished';
  project: string;
  /** The deep link: the session in the office. */
  to: string;
  /** How long the turn that just ended had been running; null for events that are not a turn ending. */
  turnMs: number | null;
};
export type Brief = { key: string; activity: string; project: string; to: string };
export type Seen = { activity: string; since: number };

/** A turn shorter than this is not worth interrupting someone for when they come back to the tab anyway. */
export const LONG_TURN_MS = 60_000;
const BODY_MAX = 60;

/**
 * What changed since the last look: a session that now waits for a human (an approval or a question), or one that
 * stopped working. The first call only records the current states, so opening the page never floods notifications.
 */
export function sessionTransitions(
  before: ReadonlyMap<string, Seen> | null,
  sessions: readonly Brief[],
  now: number,
): { events: SessionEvent[]; states: Map<string, Seen> } {
  const states = new Map(
    sessions.map((s) => {
      const was = before?.get(s.key);
      return [
        s.key,
        { activity: s.activity, since: was?.activity === s.activity ? was.since : now },
      ];
    }),
  );
  if (before === null) return { events: [], states };
  const events: SessionEvent[] = [];
  for (const s of sessions) {
    const was = before.get(s.key);
    if (was === undefined || was.activity === s.activity) continue;
    const base = { key: s.key, project: s.project, to: s.to };
    if (s.activity === 'waiting_permission')
      events.push({ ...base, kind: 'needs-you', turnMs: null });
    else if (was.activity === 'working' && (s.activity === 'idle' || s.activity === 'offline'))
      events.push({ ...base, kind: 'finished', turnMs: now - was.since });
  }
  return { events, states };
}

export type Delivery = {
  tag: string;
  title: string;
  /** The project's name and nothing else: never a prompt, a reply or a file name. */
  body: string;
  to: string;
  via: 'native' | 'toast';
};
export type Permission = NotificationPermission | 'unsupported';

/**
 * Which events become alerts, and how they are shown. A session that needs a person always alerts; one that finished
 * only when its turn was long and the tab is hidden (a visible tab shows it already). A browser notification needs
 * granted permission; without it the same alert is shown inside the page.
 */
export function planAlerts(
  events: readonly SessionEvent[],
  context: { notify: boolean; hidden: boolean; permission: Permission },
  labels: { needsYou: string; finished: string },
): Delivery[] {
  if (!context.notify) return [];
  return events
    .filter((e) => e.kind === 'needs-you' || (context.hidden && (e.turnMs ?? 0) >= LONG_TURN_MS))
    .map((e) => ({
      tag: `${e.kind}:${e.key}`,
      title: e.kind === 'needs-you' ? labels.needsYou : labels.finished,
      body: e.project.slice(0, BODY_MAX),
      to: e.to,
      via: context.permission === 'granted' ? 'native' : 'toast',
    }));
}
