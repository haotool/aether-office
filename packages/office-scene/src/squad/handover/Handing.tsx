import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { memberAt, type HandoverPlan, type MemberPose } from './plan.js';

/**
 * Moves its children along a hand-over (see plan.ts): the subagent stands, walks the folder to the supervisor's desk,
 * presents it, waves and walks out through the core. `startAt` is the wall-clock moment it finished, so a subagent
 * that scrolls out of view and back is where it would have been. The children are told which clip to hold and how fast
 * to play the walk; nothing is drawn once the subagent is out. Mounted in the seat's frame, like an arrival.
 */
export function Handing({
  plan,
  startAt,
  children,
}: {
  plan: HandoverPlan;
  startAt: number;
  children: (clip: MemberPose['clip'], pace: number) => ReactNode;
}) {
  const invalidate = useThree((s) => s.invalidate);
  const body = useRef<Group>(null);
  const [state, setState] = useState(() => {
    const first = memberAt(plan, Date.now() - startAt);
    return { clip: first.clip, pace: first.pace, gone: first.gone };
  });
  useEffect(() => invalidate(), [invalidate]);
  useFrame(() => {
    const pose = memberAt(plan, Date.now() - startAt);
    if (body.current) {
      body.current.position.set(pose.x, 0, pose.z);
      body.current.rotation.y = pose.yaw;
      body.current.scale.setScalar(Math.max(pose.scale, 0.001));
    }
    setState((s) =>
      s.clip === pose.clip && s.pace === pose.pace && s.gone === pose.gone
        ? s
        : { clip: pose.clip, pace: pose.pace, gone: pose.gone },
    );
    if (!pose.gone) invalidate();
  });
  if (state.gone) return null;
  return <group ref={body}>{children(state.clip, state.pace)}</group>;
}
