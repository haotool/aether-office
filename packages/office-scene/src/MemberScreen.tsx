import { useMemo } from 'react';
import type { Agent } from '@aether/contracts';
import { SCREEN_H, SCREEN_W, screenTexture } from './screens.js';

/** A member's own screen: role-themed art whose brightness follows the member's real activity. */
export function MemberScreen({
  role,
  member,
  accent,
  activity,
}: {
  role: string;
  member: string;
  accent: string;
  activity: Agent['activity'];
}) {
  const texture = useMemo(() => screenTexture(role, member, accent), [role, member, accent]);
  const opacity =
    activity === 'offline' || activity === 'unknown'
      ? 0.12
      : ['working', 'reviewing', 'waiting_permission', 'waiting_peer'].includes(activity)
        ? 1
        : 0.5;
  return (
    <mesh position={[0, 1.16, -0.3]}>
      <planeGeometry args={[0.66, (0.66 * SCREEN_H) / SCREEN_W]} />
      <meshBasicMaterial map={texture} transparent opacity={opacity} toneMapped={false} side={2} />
    </mesh>
  );
}
