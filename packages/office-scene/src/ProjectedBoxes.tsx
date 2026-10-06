import { useEffect, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

const EDGE_PX = 8;
const TOP_PX = 56; // under the floor card and the toolbar

type Anchor = { id: string; x: number; y: number; z: number };

/**
 * Places DOM boxes (the hover card, the action menu, the emote icons, a quick message) at world points, every frame the
 * scene draws. `above` centres a box over its point; `side` puts it beside the point and keeps the whole box inside the
 * canvas, whatever its size. A box behind the camera is hidden.
 */
export function ProjectedBoxes({
  anchors,
  elements,
  placement,
}: {
  anchors: readonly Anchor[];
  elements: ReadonlyMap<string, HTMLElement>;
  placement: 'above' | 'side';
}) {
  const point = useRef(new Vector3());
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [anchors, invalidate]); // a still scene draws no frame of its own: ask for one
  useFrame(({ camera, size }) => {
    for (const a of anchors) {
      const element = elements.get(a.id);
      if (!element) continue;
      point.current.set(a.x, a.y, a.z).project(camera);
      const x = ((point.current.x + 1) * size.width) / 2;
      const y = ((1 - point.current.y) * size.height) / 2;
      const ahead = point.current.z >= -1 && point.current.z <= 1;
      element.style.visibility = ahead ? 'visible' : 'hidden';
      element.style.opacity = '1'; // placed: see character-menu.css (it is focusable, but unseen, until then)
      if (placement === 'above') {
        element.style.transform = `translate(${x}px,${y}px) translate(-50%,-100%)`;
        continue;
      }
      const w = element.offsetWidth;
      const h = element.offsetHeight;
      const left = Math.min(Math.max(x + 24, EDGE_PX), Math.max(EDGE_PX, size.width - w - EDGE_PX));
      const top = Math.min(
        Math.max(y - h / 2, TOP_PX),
        Math.max(TOP_PX, size.height - h - EDGE_PX),
      );
      element.style.transform = `translate(${left}px,${top}px)`;
    }
  });
  return null;
}
