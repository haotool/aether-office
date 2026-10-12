import { Edges } from '@react-three/drei';
import { floorY } from '../scene/scene-geometry.js';
import type { SeatDrag } from '../core/use-seat-drag.js';

const FOOT = [2.2, 0.06, 1.8] as const;
const OK = '#43e6df';
const BLOCKED = '#ff7a85';

export function SeatGhost({ drag, exploded }: { drag: SeatDrag; exploded: boolean }) {
  const y = floorY(drag.floor, exploded);
  const color = drag.check.ok ? OK : BLOCKED;
  const turn = (drag.rotation * Math.PI) / 2;
  return (
    <>
      <mesh position={[drag.x, y + 0.05, drag.z]} rotation={[0, turn, 0]}>
        <boxGeometry args={FOOT} />
        <meshBasicMaterial color={color} transparent opacity={0.34} depthWrite={false} />
        <Edges color={color} />
      </mesh>
      <mesh position={[drag.from.x, y + 0.04, drag.from.z]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.5, 0.62, 32]} />
        <meshBasicMaterial color={OK} transparent opacity={0.6} depthWrite={false} />
      </mesh>
    </>
  );
}
