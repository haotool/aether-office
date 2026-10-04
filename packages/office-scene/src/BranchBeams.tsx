import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, QuadraticBezierCurve3, TubeGeometry, Vector3, type Mesh } from 'three';

/**
 * Each member's branch as a beam of light from the desk into the elevator core, which stands for the default branch.
 * A linked worktree is cyan, the main checkout white, uncommitted work amber; while the member works the beam flows
 * toward the core. Only real Git state is drawn: no beam without a branch.
 */
function BranchBeam({
  from,
  to,
  color,
  flowing,
  animate,
}: {
  from: [number, number, number];
  to: [number, number, number];
  color: string;
  flowing: boolean;
  animate: boolean;
}) {
  const curve = useMemo(
    () =>
      new QuadraticBezierCurve3(
        new Vector3(...from),
        new Vector3((from[0] + to[0]) / 2, Math.max(from[1], to[1]) + 2.2, (from[2] + to[2]) / 2),
        new Vector3(...to),
      ),
    [from[0], from[1], from[2], to[0], to[1], to[2]], // eslint-disable-line react-hooks/exhaustive-deps -- by value
  );
  const geometry = useMemo(
    () => new TubeGeometry(curve, 28, flowing ? 0.075 : 0.055, 6, false),
    [curve, flowing],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  const packets = useRef<(Mesh | null)[]>([]);
  const clock = useRef(0);
  useFrame((_state, delta) => {
    if (!flowing || !animate) return;
    clock.current += delta;
    packets.current.forEach((mesh, i) => {
      if (!mesh) return;
      mesh.position.copy(curve.getPoint((clock.current * 0.35 + i / 3) % 1));
    });
  });
  return (
    <group>
      <mesh geometry={geometry}>
        <meshBasicMaterial
          color={color}
          transparent
          opacity={flowing ? 0.9 : 0.4}
          blending={AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      {flowing &&
        [0, 1, 2].map((i) => (
          <mesh
            key={i}
            ref={(node) => {
              packets.current[i] = node;
            }}
            position={curve.getPoint(i / 3)}
          >
            <sphereGeometry args={[0.11, 10, 8]} />
            <meshBasicMaterial color={color} toneMapped={false} />
          </mesh>
        ))}
    </group>
  );
}

/**
 * Each member's branch as a tube of light from the desk into the elevator core, which stands for the default branch.
 * A linked worktree is cyan, the main checkout white, a detached checkout violet, uncommitted work amber; while the
 * member works, packets travel
 * along it into the core. Only real Git state is drawn: no beam outside a repository.
 */
export function BranchBeams({
  beams,
  animate,
}: {
  beams: {
    id: string;
    from: [number, number, number];
    to: [number, number, number];
    color: string;
    flowing: boolean;
  }[];
  animate: boolean;
}) {
  return (
    <>
      {beams.map((beam) => (
        <BranchBeam key={beam.id} {...beam} animate={animate} />
      ))}
    </>
  );
}
