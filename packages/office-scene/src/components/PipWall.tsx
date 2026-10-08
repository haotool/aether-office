import type { Agent } from '@aether/contracts';
import type { Feed } from '../core/multi-view.js';
import { sceneText } from '../i18n/scene-text.js';

type PipWallProps = {
  feeds: readonly Feed[];
  /** Members the person pinned: their view is marked and stays. */
  pinned: ReadonlySet<string>;
  agents: readonly Agent[];
  doing: Readonly<Record<string, string>> | undefined;
  intensity: Readonly<Record<string, number>> | undefined;
  zh: boolean;
  onSelect: (id: string) => void;
  onClose: () => void;
};

type PipProps = {
  agent: Agent;
  index: number;
  pinned: boolean;
  level: number;
  caption: string;
  zh: boolean;
  onSelect: (id: string) => void;
};

/** One small view's frame: the camera number, how hard the member works (one to three bars) and its caption. */
function Pip({ agent, index, pinned, level, caption, zh, onSelect }: PipProps) {
  return (
    <button
      className={`pip ${pinned ? 'pinned' : ''}`}
      data-feed={agent.id}
      data-pinned={pinned || undefined}
      aria-label={sceneText(zh, 'pip.switchTo', { name: agent.name })}
      onClick={() => onSelect(agent.id)}
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
        <small>{caption}</small>
      </span>
    </button>
  );
}

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
}: PipWallProps) {
  return (
    <div className="pip-wall">
      <div className="pip-bar">
        <i aria-hidden="true" />
        <span>{sceneText(zh, 'pip.live')}</span>
        <button className="pip-close" aria-label={sceneText(zh, 'pip.close')} onClick={onClose}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <div className="pip-row">
        {feeds.map((feed, index) => {
          const agent = agents.find((a) => a.id === feed.id);
          if (!agent) return null;
          return (
            <Pip
              key={feed.id}
              agent={agent}
              index={index}
              pinned={pinned.has(feed.id)}
              level={intensity?.[feed.id] ?? 0}
              caption={doing?.[feed.id] ?? agent.role}
              zh={zh}
              onSelect={onSelect}
            />
          );
        })}
      </div>
    </div>
  );
}
