import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import type { EmoteCue } from '../Animal.js';
import { arrivalAt, type Arrival, type ErrandPose } from './errand.js';

/**
 * Moves its children along an arrival (see errand.ts): out of the core, to the pod, a turn to face the supervisor. The
 * children are told which clip to hold and, once there, to sit down. With no plan the member is simply seated.
 */
export function Arriving({
  plan,
  startAt,
  reducedMotion,
  children,
}: {
  plan: Arrival | undefined;
  startAt: number;
  reducedMotion: boolean;
  children: (clip: ErrandPose['clip'], sit: EmoteCue | undefined) => ReactNode;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const body = useRef<Group>(null);
  const [state, setState] = useState<{ clip: ErrandPose['clip']; done: boolean }>(() => {
    const first = plan && !reducedMotion ? arrivalAt(plan, Date.now() - startAt) : null;
    return { clip: first?.clip ?? null, done: !first || first.done };
  });
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    if (!plan || state.done) return;
    const pose = arrivalAt(plan, Date.now() - startAt);
    body.current?.position.set(pose.x, 0, pose.z);
    if (body.current) {
      body.current.rotation.y = pose.yaw;
      body.current.scale.setScalar(Math.max(pose.scale, 0.001));
      body.current.visible = !pose.hidden;
    }
    setState((s) =>
      s.clip === pose.clip && s.done === pose.done ? s : { clip: pose.clip, done: pose.done },
    );
    if (!pose.done) invalidate();
  });
  const sits = !!plan && plan.mode === 'walk' && state.done && !reducedMotion;
  return (
    <group ref={body}>
      {children(state.done ? null : state.clip, sits ? { clip: 'sit_down', key: 1 } : undefined)}
    </group>
  );
}
