import type { Agent } from '@aether/contracts';
import type { Feed } from './multi-view.js';

/**
 * The control-room wall: a frame over each small live view (MultiCam draws what is inside it, at the frame's own
 * rectangle): which camera, who it is on, what they are doing and how hard. Choosing one hands the main camera to that
 * member (the director gives way to the person).
 */
export function PipWall({
  feeds,
  pinned,
  agents,
  doing,
  intensity,
  zh,
  onSelect,
  onClose,
}: {
  feeds: readonly Feed[];
  /** Members the person pinned: their view is marked and stays. */
  pinned: ReadonlySet<string>;
  agents: readonly Agent[];
  doing: Readonly<Record<string, string>> | undefined;
  intensity: Readonly<Record<string, number>> | undefined;
  zh: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="pip-wall">
      <div className="pip-bar">
        <i aria-hidden="true" />
        <span>{zh ? '即時畫面' : 'LIVE'}</span>
        <button
          className="pip-close"
          aria-label={zh ? '關閉分屏' : 'Close split view'}
          onClick={onClose}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="pip-row">
        {feeds.map((feed, index) => {
          const agent = agents.find((a) => a.id === feed.id);
          if (!agent) return null;
          const level = intensity?.[feed.id] ?? 0;
          return (
            <button
              key={feed.id}
              className={`pip ${pinned.has(feed.id) ? 'pinned' : ''}`}
              data-feed={feed.id}
              data-pinned={pinned.has(feed.id) || undefined}
              aria-label={zh ? `切換到 ${agent.name}` : `Switch to ${agent.name}`}
              onClick={() => onSelect(feed.id)}
            >
              <span className="pip-cam" aria-hidden="true">
                CAM {index + 1}
              </span>
              <span className="pip-load" aria-hidden="true">
                {[1, 2, 3].map((n) => (
                  <i key={n} className={level >= n ? 'on' : ''} />
                ))}
              </span>
              <span className="pip-caption">
                <b>{agent.name}</b>
                <small>{doing?.[feed.id] ?? agent.role}</small>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
