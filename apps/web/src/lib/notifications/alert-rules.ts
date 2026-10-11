import { toPlainPreview } from '@aether/kernel';
export type SessionEvent = {
  key: string;
  kind: 'needs-you' | 'finished';
  project: string;
  to: string;
  turnMs: number | null;
};
export type Brief = { key: string; activity: string; project: string; to: string };
type Seen = { activity: string; since: number };

export const LONG_TURN_MS = 60_000;
const BODY_MAX = 60;

/**
 * What changed since the last look: a session that now waits for a human, or one that stopped working. The first call
 * only records the current states, so opening the page never floods notifications.
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
 * A session that needs a person always alerts; one that finished only when its turn was long and the tab is hidden (a
 * visible tab shows it already).
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
      body: toPlainPreview(e.project, { maxChars: BODY_MAX }),
      to: e.to,
      via: context.permission === 'granted' ? 'native' : 'toast',
    }));
}
