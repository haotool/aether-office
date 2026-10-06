import { useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import type { Seat } from './director.js';
import { engagement, nodPitch, turnToward, type Engagement } from './interplay.js';

/** How quickly a member's turn follows its target, per second (an exponential approach, so it never snaps). */
const FOLLOW = 7;
/** A nod is a bob of the whole upper body about the seat; this much of it also dips the seat. */
const DIP = 0.15;

/**
 * Turns a seated member toward the one it is talking with (while a message is current) and nods the receiver when the
 * envelope lands. A rigid turn of the character about its seat, limited to a glance (see interplay.ts); the animation
 * underneath keeps playing. Idle members cost one comparison a frame.
 */
export function Poser({
  seat,
  engagements,
  reducedMotion,
  children,
}: {
  seat: Seat;
  engagements: readonly Engagement[] | undefined;
  reducedMotion: boolean;
  children: ReactNode;
}) {
  const group = useRef<Group>(null);
  const turn = useRef(0);
  useFrame(({ invalidate }, delta) => {
    const target = group.current;
    if (!target) return;
    const latest = reducedMotion ? undefined : engagements?.[0];
    const age = latest ? Date.now() - latest.at : Infinity;
    const wanted = latest ? turnToward(seat, latest.partner) * engagement(age) : 0;
    const pitch = latest?.receives ? nodPitch(age) : 0;
    if (wanted === 0 && turn.current === 0 && pitch === 0) return;
    turn.current += (wanted - turn.current) * Math.min(1, delta * FOLLOW);
    if (Math.abs(turn.current) < 0.0005 && wanted === 0) turn.current = 0;
    target.rotation.y = turn.current;
    target.rotation.x = pitch;
    target.position.y = -pitch * DIP;
    invalidate();
  });
  return <group ref={group}>{children}</group>;
}
