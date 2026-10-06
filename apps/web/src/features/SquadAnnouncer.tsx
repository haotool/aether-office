import { useEffect, useRef, useState } from 'react';
import { useT } from '../ui.js';
import { snapshotOf, squadChange, type SquadChange, type SquadSnapshot } from './feed-squads.js';
import type { Feed } from './feed-model.js';
import { fmt } from './squad-text.js';

/** A burst of subagents starting is one sentence, not thirty: changes are gathered for this long, then announced once. */
export const ANNOUNCE_EVERY_MS = 4000;

/**
 * A polite live region for the feed: "2 subagents started, 1 subagent finished". It says nothing about what was already
 * there when the feed opened, and never more often than every few seconds.
 */
export function SquadAnnouncer({ feed }: { feed: Feed }) {
  const t = useT();
  const [said, setSaid] = useState({ text: '', n: 0 });
  const seen = useRef<SquadSnapshot | null>(null);
  const pending = useRef<SquadChange>({ started: 0, finished: 0 });
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    const now = snapshotOf(feed);
    const before = seen.current;
    seen.current = now;
    if (!before) return;
    const change = squadChange(before, now);
    pending.current = {
      started: pending.current.started + change.started,
      finished: pending.current.finished + change.finished,
    };
    if (timer.current || (!pending.current.started && !pending.current.finished)) return;
    timer.current = setTimeout(() => {
      timer.current = undefined;
      const { started, finished } = pending.current;
      pending.current = { started: 0, finished: 0 };
      const parts = [
        started && fmt(t(started === 1 ? 'squadAnnStartedOne' : 'squadAnnStarted'), { n: started }),
        finished &&
          fmt(t(finished === 1 ? 'squadAnnFinishedOne' : 'squadAnnFinished'), { n: finished }),
      ].filter(Boolean);
      setSaid((was) => ({ text: parts.join(', '), n: was.n + 1 }));
    }, ANNOUNCE_EVERY_MS);
  }, [feed, t]);
  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="visually-hidden" role="status" aria-live="polite">
      <span key={said.n}>{said.text}</span>
    </div>
  );
}
