import { useCallback, useMemo, useRef, useState } from 'react';
import type { Agent } from '@aether/contracts';
import type { Seat } from '../environment/director.js';
import { chooseFeeds, feedCapacity, type Feed, type Rect } from './multi-view.js';

type WallOptions = {
  allowed: boolean;
  agents: readonly Agent[];
  seats: ReadonlyMap<string, Seat>;
  intensity: Readonly<Record<string, number>> | undefined;
  taken: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  floor: number;
  exploded: boolean;
  /** Set to the scene's box, which is measured here (one stable ref callback: a new one every render would measure forever). */
  stage: { current: HTMLDivElement | null };
};

function useCanvasSize(stage: WallOptions['stage']) {
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const container = useCallback(
    (node: HTMLDivElement | null) => {
      stage.current = node;
      if (!node) return;
      const measure = () =>
        setCanvasSize((size) =>
          size.width === node.clientWidth && size.height === node.clientHeight
            ? size
            : { width: node.clientWidth, height: node.clientHeight },
        );
      const observer = new ResizeObserver(measure);
      observer.observe(node);
      measure();
      return () => observer.disconnect();
    },
    [stage],
  );
  return { canvasSize, container };
}

export function useWallFeeds({
  allowed,
  agents,
  seats,
  intensity,
  taken,
  pinned,
  floor,
  exploded,
  stage,
}: WallOptions) {
  const feedsRef = useRef<Feed[]>([]);
  const wall = useRef<ReadonlyMap<string, Rect>>(new Map());
  const { canvasSize, container } = useCanvasSize(stage);
  const capacity = allowed ? feedCapacity(canvasSize.width, canvasSize.height) : 0;
  const takenKey = [...taken].join('|');
  const feeds = useMemo(() => {
    if (!allowed) return [];
    feedsRef.current = chooseFeeds({
      agents,
      seats,
      intensity: new Map(Object.entries(intensity ?? {})),
      taken: new Set(takenKey ? takenKey.split('|') : []),
      previous: feedsRef.current,
      max: capacity,
      pinned,
      ...(exploded ? {} : { floor }), // a member on a floor that is not drawn would have an empty view
    });
    return feedsRef.current;
  }, [allowed, agents, seats, intensity, takenKey, capacity, pinned, floor, exploded]);
  return { feeds, wall, container, capacity };
}
