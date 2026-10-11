import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { departureAt, type Departure, type DeparturePose } from '../animals/departure.js';

/**
 * `startAt` is the wall-clock moment the departure begins, so a member that scrolls out of view or is drawn again later
 * is where it would have been.
 */
export function Departing({
  plan,
  startAt,
  reducedMotion,
  bag,
  bagColor,
  children,
}: {
  plan: Departure;
  startAt: number;
  reducedMotion: boolean;
  bag: boolean;
  bagColor: string;
  children: (clip: DeparturePose['clip']) => ReactNode;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const body = useRef<Group>(null);
  const pack = useRef<Group>(null);
  const [state, setState] = useState(() => {
    const first = departureAt(plan, Date.now() - startAt, reducedMotion);
    return { clip: first.clip, gone: first.gone };
  });
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    const pose = departureAt(plan, Date.now() - startAt, reducedMotion);
    body.current?.position.set(pose.x, 0, pose.z);
    if (body.current) body.current.rotation.y = pose.yaw;
    body.current?.scale.setScalar(Math.max(pose.scale, 0.001));
    if (pack.current) pack.current.visible = bag && pose.bag;
    setState((now) =>
      now.clip === pose.clip && now.gone === pose.gone ? now : { clip: pose.clip, gone: pose.gone },
    );
    if (!pose.gone) invalidate();
  });
  if (state.gone) return null;
  return (
    <group ref={body}>
      {children(state.clip)}
      <group ref={pack} visible={false} position={[0, 0.95, 0.2]}>
        <mesh castShadow>
          <boxGeometry args={[0.3, 0.38, 0.14]} />
          <meshStandardMaterial color={bagColor} roughness={0.7} />
        </mesh>
      </group>
    </group>
  );
}
