import { useRef, type RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Mesh } from 'three';
import type { Agent } from '@aether/contracts';
import type { Rect } from './multi-view.js';

/**
 * How much of a name tag shows by camera distance (the overview is about 60 away): close, the whole chip; beyond the
 * overview only the provider's mark and the status dot, which is all the width such a tag takes.
 */
const NEAR_DISTANCE = 30;
const FAR_DISTANCE = 85;
const FAR_WIDTH = 44;

export function ProjectedLabels({
  labels,
  elements,
  selected,
  avoid,
  covered,
}: {
  labels: { id: string; x: number; y: number; z: number; width: number }[];
  elements: Map<string, HTMLElement>;
  selected: string | null;
  /** Rectangles drawn over the canvas (the small live views): a tag under one is hidden, not drawn over its picture. */
  avoid?: RefObject<ReadonlyMap<string, Rect>>;
  /** Rectangles drawn over the canvas this frame by the speech bubbles (see ProjectedSpeech): a tag under one is hidden too. */
  covered?: RefObject<ReadonlyMap<string, Rect>>;
}) {
  const point = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const label of [...labels].sort(
      (a, b) => Number(b.id === selected) - Number(a.id === selected),
    )) {
      const element = elements.get(label.id);
      if (!element) continue;
      point.current.set(label.x, label.y, label.z);
      const distance = camera.position.distanceTo(point.current);
      const density = distance < NEAR_DISTANCE ? 'near' : distance > FAR_DISTANCE ? 'far' : 'mid';
      element.dataset['density'] = density; // the tag's own CSS decides what each step shows
      const shrunk =
        density === 'far' && label.id !== selected && element.classList.contains('scene-label');
      const width = shrunk ? FAR_WIDTH : label.width;
      point.current.project(camera);
      const x = ((point.current.x + 1) * size.width) / 2,
        y = ((1 - point.current.y) * size.height) / 2;
      const visible =
        point.current.z >= -1 &&
        point.current.z <= 1 &&
        x - width / 2 > 0 && // the whole tag fits, not just its centre
        x + width / 2 < size.width &&
        y > 55 &&
        y < size.height - 30 &&
        ![...(avoid?.current.values() ?? []), ...(covered?.current.values() ?? [])].some(
          (r) =>
            x + width / 2 > r.x &&
            x - width / 2 < r.x + r.width &&
            y + 12 > r.y &&
            y - 12 < r.y + r.height,
        ) &&
        !occupied.some(
          (p) => Math.abs(p.x - x) < (p.width + width) / 2 + 5 && Math.abs(p.y - y) < 30,
        );
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      if (visible) occupied.push({ x, y, width });
    }
  });
  return null;
}

// What each activity looks like above a character's head. Only real states are drawn; offline has no beacon.
const BEACON: Partial<Record<Agent['activity'], { color: string; size: number; pulse: boolean }>> =
  {
    working: { color: '#43e6df', size: 0.16, pulse: false },
    reviewing: { color: '#a592ff', size: 0.16, pulse: false },
    waiting_permission: { color: '#ffc65c', size: 0.2, pulse: true },
    waiting_peer: { color: '#6aa8ff', size: 0.16, pulse: true },
    error: { color: '#ff7a85', size: 0.2, pulse: true },
    idle: { color: '#4d6a78', size: 0.1, pulse: false },
    starting: { color: '#43e6df', size: 0.12, pulse: true },
  };

export function Beacons({
  items,
  animate,
}: {
  items: { id: string; x: number; y: number; z: number; activity: Agent['activity'] }[];
  animate: boolean;
}) {
  const meshes = useRef(new Map<string, Mesh>());
  const clock = useRef(0);
  useFrame((_state, delta) => {
    if (!animate) return;
    clock.current += delta;
    for (const item of items) {
      const mesh = meshes.current.get(item.id);
      const look = BEACON[item.activity];
      if (!mesh || !look) continue;
      mesh.rotation.y += delta * 1.6;
      mesh.position.y = item.y + Math.sin(clock.current * 2 + item.x) * 0.06;
      if (look.pulse) mesh.scale.setScalar(1 + 0.25 * Math.sin(clock.current * 5));
    }
  });
  return (
    <>
      {items.map((item) => {
        const look = BEACON[item.activity];
        if (!look) return null;
        return (
          <mesh
            key={item.id}
            ref={(node) => {
              if (node) meshes.current.set(item.id, node);
              else meshes.current.delete(item.id);
            }}
            position={[item.x, item.y, item.z]}
          >
            <octahedronGeometry args={[look.size, 0]} />
            <meshBasicMaterial color={look.color} transparent opacity={0.95} toneMapped={false} />
          </mesh>
        );
      })}
    </>
  );
}
