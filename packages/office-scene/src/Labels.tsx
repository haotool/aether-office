import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Vector3, type Mesh } from 'three';
import type { Agent } from '@aether/contracts';

export function ProjectedLabels({
  labels,
  elements,
  selected,
}: {
  labels: { id: string; x: number; y: number; z: number; width: number }[];
  elements: Map<string, HTMLElement>;
  selected: string | null;
}) {
  const point = useRef(new Vector3());
  useFrame(({ camera, size }) => {
    const occupied: { x: number; y: number; width: number }[] = [];
    for (const label of [...labels].sort(
      (a, b) => Number(b.id === selected) - Number(a.id === selected),
    )) {
      const element = elements.get(label.id);
      if (!element) continue;
      point.current.set(label.x, label.y, label.z).project(camera);
      const x = ((point.current.x + 1) * size.width) / 2,
        y = ((1 - point.current.y) * size.height) / 2;
      const visible =
        point.current.z >= -1 &&
        point.current.z <= 1 &&
        x - label.width / 2 > 0 && // the whole tag fits, not just its centre
        x + label.width / 2 < size.width &&
        y > 55 &&
        y < size.height - 30 &&
        !occupied.some(
          (p) => Math.abs(p.x - x) < (p.width + label.width) / 2 + 5 && Math.abs(p.y - y) < 30,
        );
      element.style.visibility = visible ? 'visible' : 'hidden';
      element.style.transform = `translate(${x}px,${y}px) translate(-50%,-50%)`;
      if (visible) occupied.push({ x, y, width: label.width });
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
