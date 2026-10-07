import { useState } from 'react';
import { FLOORS } from './layout.js';
import { introWords } from './intro/intro-text.js';
import { departmentAt } from './scene-geometry.js';
import type { FloorCount } from './SceneHud.js';

const icon = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};
const Svg = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" {...icon}>
    {children}
  </svg>
);

type HudProps = {
  zh: boolean;
  floor: number;
  exploded: boolean;
  follow: boolean;
  labels: boolean;
  perFloor: readonly FloorCount[];
  onFloor: (floor: number) => void;
  onExplode: () => void;
  onFollow: () => void;
  onLabels: () => void;
  /** Plays the first-visit tour again (absent when the page has no tour). */
  onReplayIntro?: (() => void) | undefined;
};

/** One button for each floor, the top floor first. */
function FloorButtons({ zh, floor, exploded, perFloor, onFloor }: HudProps) {
  return Array.from({ length: FLOORS }, (_, i) => FLOORS - 1 - i).map((index) => {
    const d = departmentAt(index);
    const here = perFloor[index]?.total ?? 0;
    return (
      <button
        key={d.id}
        className={`rail-floor ${index === floor && !exploded ? 'current' : ''}`}
        aria-label={`${index + 1}F ${zh ? d.zh : d.en} (${here})`}
        aria-current={index === floor ? 'true' : undefined}
        style={{ ['--accent' as string]: d.accent }}
        onClick={() => onFloor(index)}
      >
        {index + 1}
        {here > 0 && <i aria-hidden="true" />}
      </button>
    );
  });
}

/** The switches that stay folded until asked for: the exploded view, the names, the tour. */
function RailTools({ zh, exploded, labels, onExplode, onLabels, onReplayIntro }: HudProps) {
  return (
    <>
      <button
        className="rail-tool"
        aria-pressed={exploded}
        aria-label={zh ? '分層展開' : 'Exploded view'}
        onClick={onExplode}
      >
        <Svg>
          <path d="M12 3 3 8l9 5 9-5-9-5Z" />
          <path d="m3 13 9 5 9-5" />
          <path d="m3 17.5 9 5 9-5" opacity=".5" />
        </Svg>
      </button>
      <button
        className="rail-tool"
        aria-pressed={labels}
        aria-label={zh ? '顯示名稱' : 'Names'}
        onClick={onLabels}
      >
        <Svg>
          <path d="M4 7h16M4 12h10M4 17h13" />
        </Svg>
      </button>
      {onReplayIntro && (
        <button className="rail-tool" aria-label={introWords(zh).replay} onClick={onReplayIntro}>
          <Svg>
            <path d="M8 5v14l11-7-11-7Z" />
          </Svg>
        </button>
      )}
    </>
  );
}

/** The auto camera switch, and the chip with the floor's name and its head count. */
function Dock({ zh, floor, exploded, follow, perFloor, onFollow }: HudProps) {
  const department = departmentAt(floor);
  const members = perFloor[floor]?.total ?? 0;
  const working = perFloor[floor]?.working ?? 0;
  return (
    <div className="scene-dock">
      <button
        className="auto-pill"
        aria-pressed={follow}
        aria-label={zh ? '自動鏡頭' : 'Auto camera'}
        onClick={onFollow}
      >
        <i aria-hidden="true" />
        {zh ? '自動' : 'AUTO'}
      </button>
      <div
        className="floor-chip"
        style={{ ['--accent' as string]: department.accent }}
        role="status"
      >
        <b>{exploded ? (zh ? '全棟' : 'ALL') : `${floor + 1}F`}</b>
        <span>
          {exploded ? (zh ? '分層展開' : 'Exploded') : zh ? department.zh : department.en}
        </span>
        {!exploded && (
          <small>
            {members}
            {working ? ` · ${working}` : ''}
          </small>
        )}
      </div>
    </div>
  );
}

/**
 * The scene's controls on a phone, as little as can do the job: a rail of floor buttons and three switches on the right
 * edge, and one small chip with the floor's name. No panels, no readouts: the 3D office is what is on screen.
 */
export function CompactHud(props: HudProps) {
  // The three switches stay folded until asked for: the rail is five floors and one button.
  const [toolsOpen, setToolsOpen] = useState(false);
  return (
    <>
      <nav className="scene-rail" aria-label={props.zh ? '樓層' : 'Floors'}>
        <FloorButtons {...props} />
        <span className="rail-gap" aria-hidden="true" />
        <button
          className="rail-tool"
          aria-expanded={toolsOpen}
          aria-label={props.zh ? '更多控制' : 'More controls'}
          onClick={() => setToolsOpen((v) => !v)}
        >
          <Svg>
            <path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3} />
          </Svg>
        </button>
        {toolsOpen && <RailTools {...props} />}
      </nav>
      <Dock {...props} />
    </>
  );
}
