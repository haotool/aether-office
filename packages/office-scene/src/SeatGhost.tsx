import { Edges } from '@react-three/drei';
import { floorY } from './scene-geometry.js';
import type { SeatDrag } from './use-seat-drag.js';

const FOOT = [2.2, 0.06, 1.8] as const; // the desk's footprint (objectSize.desk in the kernel)
const OK = '#43e6df';
const BLOCKED = '#ff7a85';

/** The desk being carried: its footprint on the floor where it would land, green when the seat is allowed and red when not, and a mark where it came from. */
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
