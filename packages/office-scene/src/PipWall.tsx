import type { Agent } from '@aether/contracts';
import type { Feed } from './multi-view.js';

/** The frames over the small views (MultiCam draws what is inside them): who it is, what they are doing, how hard. */
export function PipWall({
  feeds,
  agents,
  doing,
  intensity,
  zh,
  onSelect,
  onClose,
}: {
  feeds: readonly Feed[];
  agents: readonly Agent[];
  doing: Readonly<Record<string, string>> | undefined;
  intensity: Readonly<Record<string, number>> | undefined;
  zh: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="pip-wall">
      <button
        className="pip-close"
        aria-label={zh ? '關閉分屏' : 'Close split view'}
        onClick={onClose}
      >
        <span aria-hidden="true">×</span>
      </button>
      {feeds.map((feed) => {
        const agent = agents.find((a) => a.id === feed.id);
        if (!agent) return null;
        const level = intensity?.[feed.id] ?? 0;
        return (
          <button key={feed.id} className="pip" onClick={() => onSelect(feed.id)}>
            <span className="pip-caption">
              <b>{agent.name}</b>
              <small>{doing?.[feed.id] ?? agent.role}</small>
            </span>
            <span className="pip-load" aria-hidden="true">
              {[1, 2, 3].map((n) => (
                <i key={n} className={level >= n ? 'on' : ''} />
              ))}
            </span>
          </button>
        );
      })}
    </div>
  );
}
